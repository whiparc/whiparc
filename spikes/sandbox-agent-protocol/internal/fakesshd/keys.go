package fakesshd

import (
	"crypto/ed25519"
	"crypto/rand"

	"golang.org/x/crypto/ssh"
)

// GenerateKeyPair returns a fresh ed25519 SSH keypair, standing in for the
// per-installation key `infracanvas sandbox up` generates under
// ~/.infracanvas/sandbox/ (see obsidian_memory/06.3) rather than the legacy
// committed sandbox/id_rsa this whole design intentionally avoids reusing.
func GenerateKeyPair() (ssh.Signer, ssh.PublicKey, error) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, err
	}
	signer, err := ssh.NewSignerFromKey(priv)
	if err != nil {
		return nil, nil, err
	}
	sshPub, err := ssh.NewPublicKey(pub)
	if err != nil {
		return nil, nil, err
	}
	return signer, sshPub, nil
}

func generateSigner() (ssh.Signer, error) {
	signer, _, err := GenerateKeyPair()
	return signer, err
}
