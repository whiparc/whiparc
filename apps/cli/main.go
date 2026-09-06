package main

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"syscall"

	"github.com/gorilla/websocket"
	"github.com/spf13/cobra"
	"golang.org/x/term"
)

type Config struct {
	APIURL string `json:"api_url"`
	Token  string `json:"token"`
	// SandboxAgentBeta gates the `sandbox` command group (Phase 1 opt-in beta —
	// see obsidian_memory/08.4). Off by default; enable via
	// `infracanvas config set sandbox-agent-beta true`.
	SandboxAgentBeta bool `json:"sandbox_agent_beta"`
	// GatewayURL is the Agent Gateway (apps/agent-gateway) the sandbox commands
	// talk to for pairing and tunneling. Defaults to http://localhost:9090.
	GatewayURL string `json:"gateway_url"`
}

type Project struct {
	ID          string `json:"id"`
	TeamID      string `json:"team_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Visibility  string `json:"visibility"`
	CreatedBy   string `json:"created_by"`
}

type FileItem struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

var (
	apiURLFlag string
	tokenFlag  string
)

func main() {
	var rootCmd = &cobra.Command{
		Use:   "infracanvas",
		Short: "Whiparc CLI - provision, validate, and manage workspaces.",
	}

	rootCmd.PersistentFlags().StringVar(&apiURLFlag, "api-url", "", "Override API backend URL (default is http://localhost:8080 or config value)")
	rootCmd.PersistentFlags().StringVar(&tokenFlag, "token", "", "Manually specify JWT token override")

	// login
	var loginCmd = &cobra.Command{
		Use:   "login",
		Short: "Authenticate user session and store credentials locally",
		Run:   runLogin,
	}

	// logout
	var logoutCmd = &cobra.Command{
		Use:   "logout",
		Short: "Revoke active token and clear stored credentials",
		Run:   runLogout,
	}

	// projects
	var projectsCmd = &cobra.Command{
		Use:   "projects",
		Short: "Manage workspace projects",
	}

	var projectsListCmd = &cobra.Command{
		Use:   "list",
		Short: "List all accessible project workspaces",
		Run:   runProjectsList,
	}

	var projectsCreateCmd = &cobra.Command{
		Use:   "create",
		Short: "Create a new visual workspace project",
		Run:   runProjectsCreate,
	}
	projectsCreateCmd.Flags().String("name", "", "Name of the project")
	projectsCreateCmd.Flags().String("description", "Created via CLI", "Short description of the project")
	projectsCreateCmd.Flags().String("visibility", "PRIVATE", "Project visibility (PRIVATE | TEAM | PUBLIC)")

	var projectsDeleteCmd = &cobra.Command{
		Use:   "delete",
		Short: "Delete a project workspace",
		Run:   runProjectsDelete,
	}
	projectsDeleteCmd.Flags().String("id", "", "ID of the target project to delete")
	projectsDeleteCmd.Flags().Bool("force", false, "Force delete without verification prompt")

	projectsCmd.AddCommand(projectsListCmd, projectsCreateCmd, projectsDeleteCmd)

	// import
	var importCmd = &cobra.Command{
		Use:   "import",
		Short: "Parse and upload local IaC files to visual canvas",
		Run:   runImport,
	}
	importCmd.Flags().String("project", "", "Target project workspace ID")
	importCmd.Flags().StringP("file", "f", "", "Specific IaC configuration file to import")
	importCmd.Flags().StringP("dir", "d", "", "Directory containing IaC files to import")

	// deploy
	var deployCmd = &cobra.Command{
		Use:   "deploy",
		Short: "Execute deployment pipeline on canvas workspace",
		Run:   runDeploy,
	}
	deployCmd.Flags().String("project", "", "Target project workspace ID")
	deployCmd.Flags().Bool("auto-destroy", false, "Auto-destroy pipeline resources after deploy finishes")

	rootCmd.AddCommand(loginCmd, logoutCmd, projectsCmd, importCmd, deployCmd, configCmd(), sandboxCmd())

	if err := rootCmd.Execute(); err != nil {
		os.Exit(1)
	}
}

// Helpers

func getClientConfig() (*Config, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	path := filepath.Join(home, ".infracanvas", "config.json")
	file, err := os.ReadFile(path)
	if err != nil {
		url := "http://localhost:8080"
		if apiURLFlag != "" {
			url = apiURLFlag
		}
		return &Config{APIURL: url, GatewayURL: "http://localhost:9090"}, nil
	}
	var cfg Config
	_ = json.Unmarshal(file, &cfg)
	if apiURLFlag != "" {
		cfg.APIURL = apiURLFlag
	}
	if cfg.APIURL == "" {
		cfg.APIURL = "http://localhost:8080"
	}
	if cfg.GatewayURL == "" {
		cfg.GatewayURL = "http://localhost:9090"
	}
	if tokenFlag != "" {
		cfg.Token = tokenFlag
	}
	return &cfg, nil
}

func saveClientConfig(cfg *Config) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	dir := filepath.Join(home, ".infracanvas")
	_ = os.MkdirAll(dir, 0755)
	path := filepath.Join(dir, "config.json")
	data, _ := json.MarshalIndent(cfg, "", "  ")
	return os.WriteFile(path, data, 0600)
}

func makeRequest(method string, path string, payload interface{}, out interface{}) error {
	cfg, err := getClientConfig()
	if err != nil {
		return err
	}

	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		body = bytes.NewReader(b)
	}

	req, err := http.NewRequest(method, cfg.APIURL+path, body)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	if cfg.Token != "" {
		req.Header.Set("Authorization", "Bearer "+cfg.Token)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API request failed with status %d: %s", resp.StatusCode, string(b))
	}

	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// Commands

func runLogin(cmd *cobra.Command, args []string) {
	cfg, err := getClientConfig()
	if err != nil {
		fmt.Printf("Config error: %v\n", err)
		return
	}

	reader := bufio.NewReader(os.Stdin)

	fmt.Print("Enter Email: ")
	email, _ := reader.ReadString('\n')
	email = strings.TrimSpace(email)

	fmt.Print("Enter Password: ")
	bytePassword, err := term.ReadPassword(int(syscall.Stdin))
	if err != nil {
		fmt.Printf("\nError reading password: %v\n", err)
		return
	}
	password := strings.TrimSpace(string(bytePassword))
	fmt.Println()

	payload := map[string]string{
		"email":    email,
		"password": password,
	}

	var result struct {
		Token string `json:"token"`
	}

	err = makeRequest("POST", "/api/auth/login", payload, &result)
	if err != nil {
		fmt.Printf("Login failed: %v\n", err)
		return
	}

	cfg.Token = result.Token
	err = saveClientConfig(cfg)
	if err != nil {
		fmt.Printf("Failed to save credentials: %v\n", err)
		return
	}

	fmt.Println("Successfully authenticated and logged in!")
}

func runLogout(cmd *cobra.Command, args []string) {
	cfg, err := getClientConfig()
	if err != nil {
		fmt.Printf("Config error: %v\n", err)
		return
	}

	cfg.Token = ""
	_ = saveClientConfig(cfg)
	fmt.Println("Credentials cleared. Logged out successfully.")
}

func runProjectsList(cmd *cobra.Command, args []string) {
	var projects []Project
	err := makeRequest("GET", "/api/projects", nil, &projects)
	if err != nil {
		fmt.Printf("Failed to retrieve projects: %v\n", err)
		return
	}

	fmt.Printf("\n%-30s | %-25s | %-10s | %-12s\n", "PROJECT ID", "NAME", "VISIBILITY", "TEAM ID")
	fmt.Println(strings.Repeat("-", 85))
	for _, p := range projects {
		fmt.Printf("%-30s | %-25s | %-10s | %-12s\n", p.ID, p.Name, p.Visibility, p.TeamID)
	}
	fmt.Println()
}

func runProjectsCreate(cmd *cobra.Command, args []string) {
	name, _ := cmd.Flags().GetString("name")
	desc, _ := cmd.Flags().GetString("description")
	vis, _ := cmd.Flags().GetString("visibility")

	if name == "" {
		reader := bufio.NewReader(os.Stdin)
		fmt.Print("Enter Project Name: ")
		name, _ = reader.ReadString('\n')
		name = strings.TrimSpace(name)
	}

	// Fetch default team first
	var teams []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	err := makeRequest("GET", "/api/teams", nil, &teams)
	if err != nil || len(teams) == 0 {
		fmt.Printf("Failed to load teams. Ensure you are logged in: %v\n", err)
		return
	}

	payload := map[string]string{
		"team_id":     teams[0].ID,
		"name":        name,
		"description": desc,
		"visibility":  strings.ToUpper(vis),
	}

	var newProj Project
	err = makeRequest("POST", "/api/projects", payload, &newProj)
	if err != nil {
		fmt.Printf("Failed to create project: %v\n", err)
		return
	}

	fmt.Printf("Successfully created project %s (ID: %s)\n", newProj.Name, newProj.ID)
}

func runProjectsDelete(cmd *cobra.Command, args []string) {
	projID, _ := cmd.Flags().GetString("id")
	force, _ := cmd.Flags().GetBool("force")

	if projID == "" {
		reader := bufio.NewReader(os.Stdin)
		fmt.Print("Enter Project ID to delete: ")
		projID, _ = reader.ReadString('\n')
		projID = strings.TrimSpace(projID)
	}

	if !force {
		reader := bufio.NewReader(os.Stdin)
		fmt.Printf("Are you sure you want to delete project %s? [y/N]: ", projID)
		confirm, _ := reader.ReadString('\n')
		confirm = strings.TrimSpace(strings.ToLower(confirm))
		if confirm != "y" && confirm != "yes" {
			fmt.Println("Aborted deletion.")
			return
		}
	}

	err := makeRequest("DELETE", "/api/projects/"+projID, nil, nil)
	if err != nil {
		fmt.Printf("Failed to delete project: %v\n", err)
		return
	}

	fmt.Println("Project deleted successfully.")
}

func runImport(cmd *cobra.Command, args []string) {
	projectID, _ := cmd.Flags().GetString("project")
	filePath, _ := cmd.Flags().GetString("file")
	dirPath, _ := cmd.Flags().GetString("dir")

	if projectID == "" {
		fmt.Println("Error: --project flag is required.")
		return
	}

	if filePath == "" && dirPath == "" {
		fmt.Println("Error: Either --file (-f) or --dir (-d) flag must be specified.")
		return
	}

	var files []FileItem

	if filePath != "" {
		data, err := os.ReadFile(filePath)
		if err != nil {
			fmt.Printf("Failed to read file %s: %v\n", filePath, err)
			return
		}
		files = append(files, FileItem{
			Name:    filepath.Base(filePath),
			Content: string(data),
		})
	} else {
		err := filepath.Walk(dirPath, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if !info.IsDir() {
				ext := strings.ToLower(filepath.Ext(path))
				if ext == ".tf" || ext == ".yml" || ext == ".yaml" {
					data, err := os.ReadFile(path)
					if err == nil {
						files = append(files, FileItem{
							Name:    filepath.Base(path),
							Content: string(data),
						})
					}
				}
			}
			return nil
		})
		if err != nil {
			fmt.Printf("Failed to walk directory: %v\n", err)
			return
		}
	}

	if len(files) == 0 {
		fmt.Println("No supported config files (.tf, .yml, .yaml) found to import.")
		return
	}

	payload := map[string]interface{}{
		"files": files,
	}

	var result map[string]interface{}
	err := makeRequest("POST", fmt.Sprintf("/api/projects/%s/import", projectID), payload, &result)
	if err != nil {
		fmt.Printf("Import failed: %v\n", err)
		return
	}

	fmt.Printf("Success: %s\n", result["message"])
}

func runDeploy(cmd *cobra.Command, args []string) {
	projectID, _ := cmd.Flags().GetString("project")
	autoDestroy, _ := cmd.Flags().GetBool("auto-destroy")

	if projectID == "" {
		fmt.Println("Error: --project flag is required.")
		return
	}

	payload := map[string]interface{}{
		"autoDestroy": autoDestroy,
	}

	var runResult struct {
		RunID  string `json:"runId"`
		Status string `json:"status"`
	}

	fmt.Println("Triggering deploy pipeline...")
	err := makeRequest("POST", fmt.Sprintf("/api/projects/%s/deploy", projectID), payload, &runResult)
	if err != nil {
		fmt.Printf("Deploy failed: %v\n", err)
		return
	}

	fmt.Printf("Pipeline execution started. Run ID: %s. Status: %s\n", runResult.RunID, runResult.Status)
	fmt.Println("Streaming execution logs in real-time:")
	fmt.Println(strings.Repeat("=", 60))

	cfg, err := getClientConfig()
	if err != nil {
		return
	}

	// Connect to WS pipeline log stream
	u, err := url.Parse(cfg.APIURL)
	if err != nil {
		return
	}
	wsScheme := "ws"
	if u.Scheme == "https" {
		wsScheme = "wss"
	}
	wsURL := fmt.Sprintf("%s://%s/api/ws/runs/%s", wsScheme, u.Host, runResult.RunID)

	ws, _, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		fmt.Printf("WebSocket connection failed: %v\n", err)
		return
	}
	defer ws.Close()

	for {
		_, message, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var logMsg struct {
			Type    string `json:"type"`
			Message string `json:"message"`
			Status  string `json:"status"`
		}

		if err := json.Unmarshal(message, &logMsg); err == nil {
			if logMsg.Type == "log" {
				fmt.Print(logMsg.Message)
			} else if logMsg.Type == "status_change" {
				fmt.Printf("\n[SYSTEM] Pipeline status changed to: %s\n", logMsg.Status)
				if logMsg.Status == "SUCCESS" || logMsg.Status == "FAILED" {
					break
				}
			}
		}
	}
	fmt.Println()
	fmt.Println(strings.Repeat("=", 60))
	fmt.Println("Deploy pipeline execution complete.")
}
