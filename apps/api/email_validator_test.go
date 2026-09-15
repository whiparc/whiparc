package main

import "testing"

func TestValidateEmail(t *testing.T) {
	tests := []struct {
		name    string
		email   string
		wantErr bool
	}{
		{name: "Valid user email", email: "developer@gmail.com", wantErr: false},
		{name: "Valid company email", email: "jane.doe@company.co.uk", wantErr: false},
		{name: "Valid plus tag email", email: "user+tag@domain.org", wantErr: false},
		{name: "Empty email", email: "", wantErr: true},
		{name: "Missing @", email: "invalidemail.com", wantErr: true},
		{name: "Missing domain", email: "user@", wantErr: true},
		{name: "Missing user", email: "@domain.com", wantErr: true},
		{name: "Missing TLD dot", email: "user@localhost", wantErr: true},
		{name: "Disposable - Mailinator", email: "test@mailinator.com", wantErr: true},
		{name: "Disposable - Mailinator subdomain", email: "test@sub.mailinator.com", wantErr: true},
		{name: "Disposable - Guerrillamail", email: "burner@guerrillamail.com", wantErr: true},
		{name: "Disposable - Tempmail", email: "temp@tempmail.com", wantErr: true},
		{name: "Disposable - 10MinuteMail", email: "fast@10minutemail.com", wantErr: true},
		{name: "Disposable - Sharklasers", email: "foo@sharklasers.com", wantErr: true},
		{name: "Disposable - Example.com", email: "test@example.com", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateEmail(tt.email)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateEmail(%q) error = %v, wantErr %v", tt.email, err, tt.wantErr)
			}
		})
	}
}
