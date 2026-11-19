package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log"
	"os"
	"sync"
	"time"

	"github.com/go-redis/redis"
)

var redisPassword = os.Getenv("REDISPASS")
var redisHost = os.Getenv("REDISHOST")

const storageIDByteLen = 16
const maxStorageIDAttempts = 5
const redisTimeout = time.Second * 10
const fileJanitorInterval = 2 * time.Hour

var errStorageIDCollision = errors.New("failed to generate unique storage id")

var redisClient *redis.Client
var redisOnce sync.Once

func getRedisClient() *redis.Client {
	redisOnce.Do(func() {
		redisClient = redis.NewClient(&redis.Options{
			Addr:         redisHost,
			Password:     redisPassword,
			DB:           0,
			ReadTimeout:  redisTimeout,
			WriteTimeout: redisTimeout,
		})
	})

	return redisClient
}

/*
store value with uniq key
return key string(hexademical number)
error in case of failure
*/
func saveToStorage(value interface{}, duration time.Duration) (newKey string, err error) {
	client := getRedisClient()

	for attempt := 0; attempt < maxStorageIDAttempts; attempt++ {
		newKey, err = generateStorageID()
		if err != nil {
			return "", err
		}

		ok, setErr := client.SetNX(getStoreKey(newKey), value, duration).Result()
		if setErr != nil {
			return "", setErr
		}
		if ok {
			if DEBUG {
				log.Printf("Got new key storage: %v", newKey)
			}
			return newKey, nil
		}
	}

	return "", errStorageIDCollision
}

// Generates uniq id storageIDByteLen length
func generateStorageID() (string, error) {
	randomBytes := make([]byte, storageIDByteLen)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", err
	}

	return base64.RawURLEncoding.EncodeToString(randomBytes), nil
}

/*
This function constructs key for messages using format like 'messageKey<id>'
*/
func getStoreKey(key string) string {
	return "messageKey" + key
}

func getFileStoreKey(key string) string {
	return "fileKey" + key
}

func getMessageInfo(key string) (shareInfo ShareInfo, status string, err error) {
	value, err := getRedisClient().Get(getStoreKey(key)).Result()
	if err == redis.Nil {
		return ShareInfo{}, "no message", nil
	}
	if err != nil {
		return ShareInfo{}, "error", err
	}

	var storedMessage StoredMessage
	if err := json.Unmarshal([]byte(value), &storedMessage); err != nil {
		return ShareInfo{}, "error", err
	}

	return ShareInfo{
		AuditEnabled: storedMessage.AuditEnabled,
	}, "ok", nil
}

func getFileInfo(key string) (shareInfo ShareInfo, status string, err error) {
	value, err := getRedisClient().Get(getFileStoreKey(key)).Result()
	if err == redis.Nil {
		return ShareInfo{}, "no message", nil
	}
	if err != nil {
		return ShareInfo{}, "error", err
	}

	var storedFile StoredFile
	if err := json.Unmarshal([]byte(value), &storedFile); err != nil {
		return ShareInfo{}, "error", err
	}

	return ShareInfo{
		AuditEnabled: storedFile.AuditEnabled,
	}, "ok", nil
}

func consumeFileMessageFromStorage(key string, hashedKey string) (storedFile StoredFile, status string, finalRead bool, err error) {
	client := getRedisClient()
	storeKey := getFileStoreKey(key)
	status = "no message"

	err = client.Watch(func(tx *redis.Tx) error {
		value, err := tx.Get(storeKey).Result()
		if err == redis.Nil {
			status = "no message"
			return nil
		}
		if err != nil {
			return err
		}

		if err := json.Unmarshal([]byte(value), &storedFile); err != nil {
			return err
		}
		storedFile.MaxViews = normalizeMaxViews(storedFile.MaxViews)

		if subtle.ConstantTimeCompare([]byte(storedFile.HashedKey), []byte(hashedKey)) != 1 {
			status = "wrong key"
			return nil
		}

		ttl, err := tx.TTL(storeKey).Result()
		if err != nil {
			return err
		}
		if ttl <= 0 {
			storedFile = StoredFile{}
			status = "no message"
			return nil
		}

		nextReadCount := storedFile.ReadCount + 1
		finalRead = nextReadCount >= storedFile.MaxViews

		_, err = tx.TxPipelined(func(pipe redis.Pipeliner) error {
			if finalRead {
				pipe.Del(storeKey)
				return nil
			}

			storedFile.ReadCount = nextReadCount
			updatedValue, err := json.Marshal(storedFile)
			if err != nil {
				return err
			}
			pipe.Set(storeKey, updatedValue, ttl)
			return nil
		})
		if err == redis.TxFailedErr {
			storedFile = StoredFile{}
			status = "no message"
			finalRead = false
			return nil
		}
		if err != nil {
			return err
		}

		storedFile.ReadCount = nextReadCount
		status = "ok"
		return nil
	}, storeKey)

	return
}

func startFileJanitor() {
	go runFileJanitorLoop()
}

func runFileJanitorLoop() {
	if err := cleanupExpiredFiles(time.Now().UTC()); err != nil {
		log.Printf("cleanupExpiredFiles error: %v", err)
	}

	ticker := time.NewTicker(fileJanitorInterval)
	defer ticker.Stop()

	for now := range ticker.C {
		if err := cleanupExpiredFiles(now.UTC()); err != nil {
			log.Printf("cleanupExpiredFiles error: %v", err)
		}
	}
}

func cleanupExpiredFiles(now time.Time) error {
	entries, err := os.ReadDir(fileStorageDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || len(entry.Name()) < 4 || entry.Name()[len(entry.Name())-4:] != ".enc" {
			continue
		}

		info, err := entry.Info()
		if err != nil {
			return err
		}
		if info.ModTime().After(now) {
			continue
		}

		filePath := fileStorageDir + string(os.PathSeparator) + entry.Name()
		if err := os.Remove(filePath); err != nil && !os.IsNotExist(err) {
			return err
		}
	}

	return nil
}

func consumeMessageFromStorage(key string, hashedKey string) (storedMessage StoredMessage, status string, finalRead bool, err error) {
	client := getRedisClient()
	storeKey := getStoreKey(key)
	status = "no message"

	err = client.Watch(func(tx *redis.Tx) error {
		value, err := tx.Get(storeKey).Result()
		if err == redis.Nil {
			status = "no message"
			return nil
		}
		if err != nil {
			return err
		}

		if err := json.Unmarshal([]byte(value), &storedMessage); err != nil {
			return err
		}
		storedMessage.MaxViews = normalizeMaxViews(storedMessage.MaxViews)

		if subtle.ConstantTimeCompare([]byte(storedMessage.HashedKey), []byte(hashedKey)) != 1 {
			status = "wrong key"
			return nil
		}

		ttl, err := tx.TTL(storeKey).Result()
		if err != nil {
			return err
		}
		if ttl <= 0 {
			storedMessage = StoredMessage{}
			status = "no message"
			return nil
		}

		nextReadCount := storedMessage.ReadCount + 1
		finalRead = nextReadCount >= storedMessage.MaxViews

		_, err = tx.TxPipelined(func(pipe redis.Pipeliner) error {
			if finalRead {
				pipe.Del(storeKey)
				return nil
			}

			storedMessage.ReadCount = nextReadCount
			updatedValue, err := json.Marshal(storedMessage)
			if err != nil {
				return err
			}
			pipe.Set(storeKey, updatedValue, ttl)
			return nil
		})
		if err == redis.TxFailedErr {
			storedMessage = StoredMessage{}
			status = "no message"
			finalRead = false
			return nil
		}
		if err != nil {
			return err
		}

		storedMessage.ReadCount = nextReadCount
		status = "ok"
		return nil
	}, storeKey)

	return
}
