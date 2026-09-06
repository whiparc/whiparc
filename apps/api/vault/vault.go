package vault

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"strings"
)

var masterKey []byte

func init() {
	keyStr := os.Getenv("INFRACANVAS_MASTER_KEY")
	if keyStr == "" {
		keyStr = "infracanvas-fallback-secret-key-32bytes"
	}
	hash := sha256.Sum256([]byte(keyStr))
	masterKey = hash[:]
}

// Encrypt encrypts data with AES-256-GCM and returns ciphertext, nonce, and auth tag
func Encrypt(plainText []byte) (cipherText []byte, nonce []byte, authTag []byte, err error) {
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, nil, nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, nil, err
	}

	nonce = make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, nil, err
	}

	raw := gcm.Seal(nil, nonce, plainText, nil)

	tagSize := gcm.Overhead()
	if len(raw) < tagSize {
		return nil, nil, nil, fmt.Errorf("gcm seal size mismatch")
	}

	cipherText = raw[:len(raw)-tagSize]
	authTag = raw[len(raw)-tagSize:]

	return cipherText, nonce, authTag, nil
}

// Decrypt decrypts ciphertext using AES-256-GCM, nonce, and auth tag
func Decrypt(cipherText []byte, nonce []byte, authTag []byte) ([]byte, error) {
	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	fullCipherText := append(cipherText, authTag...)
	plainText, err := gcm.Open(nil, nonce, fullCipherText, nil)
	if err != nil {
		return nil, err
	}

	return plainText, nil
}

// Fingerprint masks key values for previewing in project settings UI
func Fingerprint(provider string, rawData []byte) string {
	if provider == "AWS" {
		var creds struct {
			AccessKeyID string `json:"accessKeyId"`
		}
		if err := json.Unmarshal(rawData, &creds); err == nil && len(creds.AccessKeyID) > 8 {
			return fmt.Sprintf("%s****%s", creds.AccessKeyID[:4], creds.AccessKeyID[len(creds.AccessKeyID)-4:])
		}
	} else if provider == "GCP" {
		var creds struct {
			ProjectID   string `json:"project_id"`
			ClientEmail string `json:"client_email"`
		}
		if err := json.Unmarshal(rawData, &creds); err == nil {
			return fmt.Sprintf("gcp-sa:%s (%s)", creds.ProjectID, creds.ClientEmail)
		}
	} else if provider == "SSH" {
		keyStr := string(rawData)
		var sshPayload struct {
			PrivateKey string `json:"private_key"`
			SSHUser    string `json:"ssh_user"`
		}
		if err := json.Unmarshal(rawData, &sshPayload); err == nil && sshPayload.PrivateKey != "" {
			keyStr = sshPayload.PrivateKey
		}
		lines := strings.Split(keyStr, "\n")
		for _, line := range lines {
			if strings.Contains(line, "BEGIN") {
				return line + " (RSA/PEM Key)"
			}
		}
		if len(keyStr) > 20 {
			return fmt.Sprintf("ssh-key: %s...", keyStr[:15])
		}
	} else if provider == "GITHUB" {
		var creds struct {
			Token string `json:"token"`
		}
		if err := json.Unmarshal(rawData, &creds); err == nil && len(creds.Token) > 8 {
			return fmt.Sprintf("ghp_****%s", creds.Token[len(creds.Token)-4:])
		}
	}
	return "Masked Key"
}
