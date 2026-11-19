package main

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis"
)

const (
	shareKindText        = "text"
	shareKindFile        = "file"
	defaultMaxViews      = 1
	maxAllowedViews      = 5
	maxAuditEvents       = 128
	networkLookupTimeout = 1500 * time.Millisecond
	rdapLookupTimeout    = 2 * time.Second
	networkCacheTTL      = 24 * time.Hour
)

type AuditRecord struct {
	Kind           string `json:"kind"`
	AuditHashedKey string `json:"auditHashedKey"`
	CreatedAt      int64  `json:"createdAt"`
	ExpiresAt      int64  `json:"expiresAt"`
	MaxViews       int    `json:"maxViews"`
}

type AuditEvent struct {
	Timestamp int64  `json:"timestamp"`
	IP        string `json:"ip,omitempty"`
	Network   string `json:"network,omitempty"`
	Country   string `json:"country,omitempty"`
	UserAgent string `json:"userAgent"`
	EventType string `json:"eventType"`
}

type ShareInfo struct {
	AuditEnabled bool `json:"auditEnabled"`
}

type cachedNetworkLabel struct {
	value     string
	expiresAt time.Time
}

type publicNetworkDetails struct {
	network string
	country string
}

type cachedPublicNetworkDetails struct {
	details   publicNetworkDetails
	expiresAt time.Time
}

var auditNetworkLabelCache sync.Map
var auditPublicNetworkDetailsCache sync.Map

var (
	carrierGradeNATNet = mustParseCIDR("100.64.0.0/10")
)

func normalizeMaxViews(maxViews int) int {
	if maxViews <= 0 {
		return defaultMaxViews
	}
	if maxViews > maxAllowedViews {
		return maxAllowedViews
	}

	return maxViews
}

func getAuditMetaKey(kind string, key string) string {
	return "auditMeta:" + kind + ":" + key
}

func getAuditEventsKey(kind string, key string) string {
	return "auditEvents:" + kind + ":" + key
}

func saveAuditRecord(kind string, key string, record AuditRecord, ttl time.Duration) error {
	value, err := json.Marshal(record)
	if err != nil {
		return err
	}

	return getRedisClient().Set(getAuditMetaKey(kind, key), value, ttl).Err()
}

func loadAuditRecord(kind string, key string) (AuditRecord, bool, error) {
	value, err := getRedisClient().Get(getAuditMetaKey(kind, key)).Result()
	if err == redis.Nil {
		return AuditRecord{}, false, nil
	}
	if err != nil {
		return AuditRecord{}, false, err
	}

	var record AuditRecord
	if err := json.Unmarshal([]byte(value), &record); err != nil {
		return AuditRecord{}, false, err
	}

	record.MaxViews = normalizeMaxViews(record.MaxViews)
	return record, true, nil
}

func appendAuditEvent(kind string, key string, event AuditEvent) error {
	client := getRedisClient()
	metaKey := getAuditMetaKey(kind, key)
	eventsKey := getAuditEventsKey(kind, key)

	ttl, err := client.TTL(metaKey).Result()
	if err == redis.Nil || ttl <= 0 {
		return nil
	}
	if err != nil {
		return err
	}

	value, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = client.TxPipelined(func(pipe redis.Pipeliner) error {
		pipe.RPush(eventsKey, value)
		pipe.LTrim(eventsKey, -maxAuditEvents, -1)
		pipe.Expire(eventsKey, ttl)
		return nil
	})

	return err
}

func loadAuditEvents(kind string, key string) ([]AuditEvent, error) {
	values, err := getRedisClient().LRange(getAuditEventsKey(kind, key), 0, -1).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	events := make([]AuditEvent, 0, len(values))
	for _, value := range values {
		var event AuditEvent
		if err := json.Unmarshal([]byte(value), &event); err != nil {
			return nil, err
		}
		events = append(events, event)
	}

	return events, nil
}

func sanitizeAuditEvents(events []AuditEvent) []AuditEvent {
	if len(events) == 0 {
		return nil
	}

	sanitized := make([]AuditEvent, 0, len(events))
	for _, event := range events {
		event.Network, event.Country = enrichAuditEventDisplay(event)
		event.IP = ""
		sanitized = append(sanitized, event)
	}

	return sanitized
}

func countSuccessfulReads(events []AuditEvent) int {
	successes := 0

	for _, event := range events {
		switch event.EventType {
		case "reveal_success", "download_success":
			successes++
		}
	}

	return successes
}

func extractClientIP(r *http.Request) string {
	forwardedFor := r.Header.Get("X-Forwarded-For")
	if forwardedFor != "" {
		parts := strings.Split(forwardedFor, ",")
		if len(parts) > 0 {
			ip := strings.TrimSpace(parts[0])
			if ip != "" {
				return ip
			}
		}
	}

	realIP := strings.TrimSpace(r.Header.Get("X-Real-IP"))
	if realIP != "" {
		return realIP
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}

	return strings.TrimSpace(r.RemoteAddr)
}

func mustParseCIDR(cidr string) *net.IPNet {
	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		panic(err)
	}

	return network
}

func resolveClientNetwork(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return "Unknown network"
	}

	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return "Unknown network"
	}

	if label, ok := classifySpecialNetwork(parsedIP); ok {
		return label
	}

	cacheKey := parsedIP.String()
	if cached, ok := auditNetworkLabelCache.Load(cacheKey); ok {
		entry := cached.(cachedNetworkLabel)
		if time.Now().Before(entry.expiresAt) {
			return entry.value
		}
		auditNetworkLabelCache.Delete(cacheKey)
	}

	label := lookupPublicNetworkLabel(parsedIP)
	if label == "" {
		label = "Public network"
	}

	auditNetworkLabelCache.Store(cacheKey, cachedNetworkLabel{
		value:     label,
		expiresAt: time.Now().Add(networkCacheTTL),
	})

	return label
}

func enrichAuditEventDisplay(event AuditEvent) (network string, country string) {
	network = event.Network
	country = event.Country

	details := getPublicNetworkDetails(event.IP)
	if details.network != "" {
		network = details.network
	}
	if country == "" {
		country = details.country
	}
	if network == "" {
		network = resolveClientNetwork(event.IP)
	}

	return network, country
}

func getPublicNetworkDetails(ip string) publicNetworkDetails {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return publicNetworkDetails{}
	}

	parsedIP := net.ParseIP(ip)
	if parsedIP == nil {
		return publicNetworkDetails{}
	}

	if _, ok := classifySpecialNetwork(parsedIP); ok {
		return publicNetworkDetails{}
	}

	cacheKey := parsedIP.String()
	if cached, ok := auditPublicNetworkDetailsCache.Load(cacheKey); ok {
		entry := cached.(cachedPublicNetworkDetails)
		if time.Now().Before(entry.expiresAt) {
			return entry.details
		}
		auditPublicNetworkDetailsCache.Delete(cacheKey)
	}

	details := lookupPublicNetworkDetails(parsedIP)
	auditPublicNetworkDetailsCache.Store(cacheKey, cachedPublicNetworkDetails{
		details:   details,
		expiresAt: time.Now().Add(networkCacheTTL),
	})

	return details
}

func classifySpecialNetwork(ip net.IP) (string, bool) {
	switch {
	case ip.IsLoopback():
		return "Loopback/private network", true
	case ip.IsPrivate():
		return "Private/VPN network", true
	case ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast():
		return "Link-local network", true
	case carrierGradeNATNet.Contains(ip):
		return "Carrier-grade NAT / VPN network", true
	case ip.IsMulticast():
		return "Multicast network", true
	case ip.IsUnspecified():
		return "Unknown network", true
	default:
		return "", false
	}
}

func lookupPublicNetworkLabel(ip net.IP) string {
	ctx, cancel := context.WithTimeout(context.Background(), networkLookupTimeout)
	defer cancel()

	names, err := net.DefaultResolver.LookupAddr(ctx, ip.String())
	if err != nil || len(names) == 0 {
		return ""
	}

	name := strings.TrimSuffix(strings.TrimSpace(strings.ToLower(names[0])), ".")
	if name == "" {
		return ""
	}

	return name
}

func lookupPublicNetworkDetails(ip net.IP) publicNetworkDetails {
	ctx, cancel := context.WithTimeout(context.Background(), rdapLookupTimeout)
	defer cancel()

	requestURL := "https://rdap.org/ip/" + url.PathEscape(ip.String())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, requestURL, nil)
	if err != nil {
		return publicNetworkDetails{}
	}
	req.Header.Set("Accept", "application/rdap+json, application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return publicNetworkDetails{}
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return publicNetworkDetails{}
	}

	var payload map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return publicNetworkDetails{}
	}

	return publicNetworkDetails{
		network: extractRdapNetworkLabel(payload),
		country: extractRdapCountry(payload),
	}
}

func extractRdapNetworkLabel(payload map[string]interface{}) string {
	for _, role := range []string{"registrant", "administrative", "technical"} {
		if label := extractRdapEntityLabelByRole(payload, role); label != "" {
			return label
		}
	}

	name := strings.TrimSpace(getStringValue(payload["name"]))
	if name != "" {
		return name
	}

	return ""
}

func extractRdapCountry(payload map[string]interface{}) string {
	for _, role := range []string{"registrant", "administrative", "technical"} {
		if country := extractRdapEntityCountryByRole(payload, role); country != "" {
			return country
		}
	}

	country := strings.TrimSpace(getStringValue(payload["country"]))
	if country != "" {
		return strings.ToUpper(country)
	}

	return ""
}

func extractRdapEntityLabelByRole(payload map[string]interface{}, wantedRole string) string {
	for _, entity := range getMapSlice(payload["entities"]) {
		if !entityHasRole(entity, wantedRole) {
			continue
		}

		if label := extractVCardTextField(entity["vcardArray"], "org"); label != "" {
			return label
		}
		if label := extractVCardTextField(entity["vcardArray"], "fn"); label != "" {
			return label
		}
	}

	return ""
}

func extractRdapEntityCountryByRole(payload map[string]interface{}, wantedRole string) string {
	for _, entity := range getMapSlice(payload["entities"]) {
		if !entityHasRole(entity, wantedRole) {
			continue
		}

		if country := extractVCardAddressCountry(entity["vcardArray"]); country != "" {
			return country
		}
	}

	return ""
}

func entityHasRole(entity map[string]interface{}, wantedRole string) bool {
	for _, rawRole := range getSlice(entity["roles"]) {
		if strings.EqualFold(strings.TrimSpace(getStringValue(rawRole)), wantedRole) {
			return true
		}
	}

	return false
}

func extractVCardTextField(rawVCard interface{}, wantedField string) string {
	entries := getVCardEntries(rawVCard)
	for _, entry := range entries {
		if !strings.EqualFold(strings.TrimSpace(getStringValue(entry[0])), wantedField) {
			continue
		}

		value := strings.TrimSpace(getStringValue(entry[3]))
		if value != "" {
			return value
		}
	}

	return ""
}

func extractVCardAddressCountry(rawVCard interface{}) string {
	entries := getVCardEntries(rawVCard)
	for _, entry := range entries {
		if !strings.EqualFold(strings.TrimSpace(getStringValue(entry[0])), "adr") {
			continue
		}

		if len(entry) < 2 {
			continue
		}

		properties, ok := entry[1].(map[string]interface{})
		if !ok {
			continue
		}

		label := strings.TrimSpace(getStringValue(properties["label"]))
		if label == "" {
			continue
		}

		lines := strings.Split(label, "\n")
		for i := len(lines) - 1; i >= 0; i-- {
			candidate := strings.TrimSpace(lines[i])
			if candidate != "" {
				return candidate
			}
		}
	}

	return ""
}

func getVCardEntries(rawVCard interface{}) [][]interface{} {
	vcardArray, ok := rawVCard.([]interface{})
	if !ok || len(vcardArray) < 2 {
		return nil
	}

	rawEntries, ok := vcardArray[1].([]interface{})
	if !ok {
		return nil
	}

	entries := make([][]interface{}, 0, len(rawEntries))
	for _, rawEntry := range rawEntries {
		entry, ok := rawEntry.([]interface{})
		if !ok || len(entry) < 4 {
			continue
		}
		entries = append(entries, entry)
	}

	return entries
}

func getMapSlice(raw interface{}) []map[string]interface{} {
	items := getSlice(raw)
	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		entry, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		result = append(result, entry)
	}

	return result
}

func getSlice(raw interface{}) []interface{} {
	items, ok := raw.([]interface{})
	if !ok {
		return nil
	}

	return items
}

func getStringValue(raw interface{}) string {
	value, ok := raw.(string)
	if !ok {
		return ""
	}

	return value
}

func newAuditEvent(r *http.Request, eventType string) AuditEvent {
	clientIP := extractClientIP(r)

	return AuditEvent{
		Timestamp: time.Now().UTC().Unix(),
		IP:        clientIP,
		Network:   resolveClientNetwork(clientIP),
		UserAgent: r.UserAgent(),
		EventType: eventType,
	}
}

func isValidAuditAccess(record AuditRecord, hashedAuditKey string) bool {
	return subtle.ConstantTimeCompare([]byte(record.AuditHashedKey), []byte(hashedAuditKey)) == 1
}
