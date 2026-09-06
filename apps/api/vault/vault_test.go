package vault

import (
	"bytes"
	"testing"
)

func TestEncryptDecrypt(t *testing.T) {
	plainText := []byte("secret-credentials-payload-123456")

	cipherText, nonce, authTag, err := Encrypt(plainText)
	if err != nil {
		t.Fatalf("Failed to encrypt: %v", err)
	}

	if len(cipherText) == 0 {
		t.Fatal("Ciphertext cannot be empty")
	}
	if len(nonce) == 0 {
		t.Fatal("Nonce cannot be empty")
	}
	if len(authTag) == 0 {
		t.Fatal("Auth tag cannot be empty")
	}

	decrypted, err := Decrypt(cipherText, nonce, authTag)
	if err != nil {
		t.Fatalf("Failed to decrypt: %v", err)
	}

	if !bytes.Equal(plainText, decrypted) {
		t.Errorf("Decrypted payload %q does not match original %q", string(decrypted), string(plainText))
	}
}

func TestFingerprint(t *testing.T) {
	awsRaw := []byte(`{"accessKeyId":"AKIA123456789012","secretAccessKey":"xyz123"}`)
	fingerprintAWS := Fingerprint("AWS", awsRaw)
	if fingerprintAWS != "AKIA****9012" {
		t.Errorf("Expected AKIA****9012, got %q", fingerprintAWS)
	}

	gcpRaw := []byte(`{"project_id":"infracanvas-prod","client_email":"sa@infracanvas-prod.iam.gserviceaccount.com"}`)
	fingerprintGCP := Fingerprint("GCP", gcpRaw)
	if fingerprintGCP != "gcp-sa:infracanvas-prod (sa@infracanvas-prod.iam.gserviceaccount.com)" {
		t.Errorf("Expected gcp-sa:infracanvas-prod (sa@infracanvas-prod.iam.gserviceaccount.com), got %q", fingerprintGCP)
	}

	sshRaw := []byte("-----BEGIN RSA PRIVATE KEY-----\nMOCKKEYCONTENT\n-----END RSA PRIVATE KEY-----")
	fingerprintSSH := Fingerprint("SSH", sshRaw)
	if fingerprintSSH != "-----BEGIN RSA PRIVATE KEY----- (RSA/PEM Key)" {
		t.Errorf("Expected prefix matching, got %q", fingerprintSSH)
	}

	sshJsonRaw := []byte(`{"private_key":"-----BEGIN OPENSSH PRIVATE KEY-----\nMOCKKEYCONTENT\n-----END OPENSSH PRIVATE KEY-----","ssh_user":"centos"}`)
	fingerprintSSHJson := Fingerprint("SSH", sshJsonRaw)
	if fingerprintSSHJson != "-----BEGIN OPENSSH PRIVATE KEY----- (RSA/PEM Key)" {
		t.Errorf("Expected JSON parsed prefix matching, got %q", fingerprintSSHJson)
	}

	githubRaw := []byte(`{"token":"ghp_1234567890abcdefghijklmnopqrstuvwxyz"}`)
	fingerprintGithub := Fingerprint("GITHUB", githubRaw)
	if fingerprintGithub != "ghp_****wxyz" {
		t.Errorf("Expected ghp_****wxyz, got %q", fingerprintGithub)
	}
}
