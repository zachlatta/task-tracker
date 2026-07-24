package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireSharedSecretBearerUsesOAuthBootstrapSecret(t *testing.T) {
	t.Parallel()

	server := NewServer(Config{Issuer: "https://tasks.example.com", Secret: "same-secret"})
	handler := server.RequireSharedSecretBearer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))

	for name, test := range map[string]struct {
		authorization string
		status        int
	}{
		"matching secret": {"Bearer same-secret", http.StatusNoContent},
		"wrong secret":    {"Bearer wrong-secret", http.StatusUnauthorized},
		"missing header":  {"", http.StatusUnauthorized},
		"wrong scheme":    {"Basic same-secret", http.StatusUnauthorized},
	} {
		t.Run(name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/tools/create_task", nil)
			request.Header.Set("Authorization", test.authorization)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != test.status {
				t.Fatalf("status = %d, want %d; body = %s", response.Code, test.status, response.Body.String())
			}
			if test.status == http.StatusUnauthorized && response.Header().Get("WWW-Authenticate") == "" {
				t.Fatal("unauthorized response has no WWW-Authenticate challenge")
			}
		})
	}
}
