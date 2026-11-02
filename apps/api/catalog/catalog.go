// Package catalog is the server-side description of the canvas nodes that AI
// mode is allowed to emit.
//
// The node library users see lives in the frontend (LIBRARY_NODES in
// apps/web/app/workspace/page.tsx), and the compilers dispatch on node ID
// prefixes. Neither is something the server can hand to a language model, and
// neither says which parameters are safe for a model to set. This package is
// that description. It is deliberately narrow: AWS Terraform plus Ansible, per
// the Phase 1 scope. See docs/plans/ai-mode-phase-1-design.md.
//
// Nothing here changes runtime behaviour. The manifest is consumed by the
// AI-mode validator and provider schema, and by drift tests that fail when this
// file, the compilers and the frontend library stop agreeing.
package catalog

import "sort"

type Tech string

const (
	TechTerraform Tech = "Terraform"
	TechAnsible   Tech = "Ansible"
	TechTarget    Tech = "Target"
)

type ParamType string

const (
	// ParamString is free text and therefore must carry a Pattern; see the
	// package tests for why.
	ParamString ParamType = "string"
	ParamInt    ParamType = "int"
	ParamBool   ParamType = "bool"
	ParamEnum   ParamType = "enum"
	// ParamIntString is an integer stored as a string, because that is what the
	// compilers read for it (getStringParam ignores a JSON number).
	ParamIntString ParamType = "intstring"
)

// Param describes one entry of a node's Parameters map, using the exact key
// the generators read.
type Param struct {
	Key  string
	Type ParamType
	// Default is what a node gets when the model does not set the parameter,
	// and what it keeps when the parameter is not AISettable. It mirrors the
	// frontend defaults.
	Default any
	Enum    []string
	// Min and Max bound ParamInt and ParamIntString.
	Min, Max int
	// Pattern is an anchored RE2 expression, mandatory for ParamString.
	Pattern string
	MaxLen  int
	// AISettable is false for anything a model must not choose: credentials,
	// resource IDs wired up by the platform, destructive flags, file paths and
	// anything that becomes shell or code on a target host.
	AISettable bool
	// ResourceLabel marks a name that the generators use as a Terraform resource
	// label (aws_subnet.<name>). Two nodes of one type sharing it produce invalid
	// Terraform, so the validator keeps these unique.
	ResourceLabel bool
	Description   string
}

type Node struct {
	// ID is the catalog ID. Canvas node IDs are ID plus a suffix, because the
	// compilers identify a node's kind by ID prefix.
	ID       string
	Tech     Tech
	Title    string
	Category string
	// Icon is the frontend icon name stored in node.data.icon.
	Icon        string
	Description string
	Params      []Param
	Outputs     []string
	// AIGeneratable is false for nodes whose purpose is to run arbitrary code
	// or move files or secrets on a user's hosts. They stay in the catalog so
	// drift checks cover them, but a model may not place them.
	AIGeneratable bool
	// GoCompiler reports whether the server-side compiler (importer.CompileCanvas)
	// has a branch for this node. The frontend generators are the primary
	// compilers; the Go one is the fallback when a run request carries no files.
	GoCompiler bool
}

// Limits applied to a single generation request.
const (
	MaxNodes     = 30
	MaxEdges     = 60
	MaxPromptLen = 2000
	// MaxRefLen bounds the model-local label used only to resolve edges.
	MaxRefLen = 32
)

// Reusable patterns. None can match a double quote, backslash, dollar sign or
// newline, because string parameters are interpolated into HCL and YAML by the
// generators without escaping.
const (
	patIdent = `^[a-zA-Z][a-zA-Z0-9_-]{0,39}$`
	// RDS accepts only letters, digits and underscores in db_name and the master
	// username, so the general identifier pattern (which allows hyphens) is too wide.
	patDBIdent    = `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`
	patCIDR       = `^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$`
	patBucket     = `^[a-z0-9][a-z0-9.-]{2,62}$`
	patAZ         = `^[a-z]{2}-[a-z]+-[0-9][a-z]$`
	patDesc       = `^[a-zA-Z0-9 .,_/&-]{0,100}$`
	patPackages   = `^[a-z0-9][a-z0-9+.-]*(, ?[a-z0-9][a-z0-9+.-]*){0,19}$`
	patUnixUser   = `^[a-z_][a-z0-9_-]{0,31}$`
	patUnitName   = `^[a-zA-Z0-9_.@-]{1,64}$`
	patPortNumber = `^[0-9]{1,5}$`
)

func ansibleHostParams() []Param {
	return []Param{
		{Key: "ansibleHost", Type: ParamString, Default: "", Pattern: `^$`, Description: "Filled in from the provisioned VM, never by a model."},
		{Key: "ansibleUser", Type: ParamString, Default: "ubuntu", Pattern: patUnixUser, MaxLen: 32, Description: "SSH user, set by the user."},
	}
}

func withHostParams(p ...Param) []Param {
	return append(p, ansibleHostParams()...)
}

var nodes = []Node{
	{
		ID: "aws_target", Tech: TechTarget, Title: "AWS Target", Category: "Cloud Target",
		Description: "Where the pipeline deploys. Chosen by the user, together with credentials and region.",
		// Carries environment, region and credential binding. The user owns it.
		AIGeneratable: false, GoCompiler: true,
	},

	// Terraform
	{
		ID: "aws_instance.web_server", Tech: TechTerraform, Title: "Virtual Machine (EC2)", Category: "Provisioning & Cloud",
		Description: "Provisions a VM instance.", AIGeneratable: true, GoCompiler: true,
		Outputs: []string{"public_ip", "private_ip", "id", "ssh_user"},
		Params: []Param{
			{Key: "instanceName", Type: ParamString, Default: "web_server", Pattern: patIdent, MaxLen: 40, AISettable: true, ResourceLabel: true},
			{Key: "amiId", Type: ParamString, Default: "ami-785db401", Pattern: `^ami-[0-9a-f]{8,17}$`, MaxLen: 21},
			{Key: "instanceType", Type: ParamEnum, Default: "t3.medium", Enum: []string{"t3.micro", "t3.small", "t3.medium", "t3.large"}, AISettable: true, Description: "Capped at t3.large so a generation cannot price itself up."},
			{Key: "subnetId", Type: ParamString, Default: "", Pattern: `^$`},
			{Key: "securityGroupId", Type: ParamString, Default: "", Pattern: `^$`},
			{Key: "rootVolumeSize", Type: ParamInt, Default: 30, Min: 8, Max: 100, AISettable: true},
		},
	},
	{
		ID: "aws_security_group", Tech: TechTerraform, Title: "Firewall (Security Group)", Category: "Provisioning & Cloud",
		Description: "Stateful firewall rules.", AIGeneratable: true, GoCompiler: true,
		Outputs: []string{"sg_id", "sg_name"},
		Params: []Param{
			{Key: "sgName", Type: ParamString, Default: "web_sg", Pattern: patIdent, MaxLen: 40, AISettable: true, ResourceLabel: true},
			{Key: "description", Type: ParamString, Default: "Allows HTTP/HTTPS inbound & SSH access", Pattern: patDesc, MaxLen: 100, AISettable: true},
			// The frontend generator supports a second shape (ingressPorts); this
			// one is used because the Go fallback compiler reads only this one.
			{Key: "httpPort", Type: ParamInt, Default: 80, Min: 1, Max: 65535, AISettable: true},
			{Key: "httpsPort", Type: ParamInt, Default: 443, Min: 1, Max: 65535, AISettable: true},
			{Key: "sshEnabled", Type: ParamBool, Default: true, AISettable: true},
			{Key: "allowedCidr", Type: ParamString, Default: "0.0.0.0/0", Pattern: patCIDR, MaxLen: 18, AISettable: true, Description: "Open by default, as in the UI. The security audit in Phase 2 is what flags this."},
			{Key: "vpcId", Type: ParamString, Default: "", Pattern: `^$`},
		},
	},
	{
		ID: "aws_s3_bucket", Tech: TechTerraform, Title: "Object Storage (S3)", Category: "Provisioning & Cloud",
		Description: "Object storage bucket.", AIGeneratable: true, GoCompiler: true,
		Outputs: []string{"bucket_name", "bucket_arn"},
		Params: []Param{
			{Key: "bucketName", Type: ParamString, Default: "whiparc-user-bucket", Pattern: patBucket, MaxLen: 63, AISettable: true, ResourceLabel: true},
			{Key: "forceDestroy", Type: ParamBool, Default: true, Description: "Destructive on teardown; not a model decision."},
			{Key: "versioningEnabled", Type: ParamBool, Default: true, AISettable: true},
		},
	},
	{
		ID: "aws_db_instance", Tech: TechTerraform, Title: "Relational Database (RDS)", Category: "Provisioning & Cloud",
		Description: "PostgreSQL database instance.", AIGeneratable: true, GoCompiler: true,
		Outputs: []string{"endpoint", "port", "db_name", "username"},
		Params: []Param{
			{Key: "dbName", Type: ParamString, Default: "appdb", Pattern: patDBIdent, MaxLen: 40, AISettable: true, ResourceLabel: true},
			{Key: "allocatedStorage", Type: ParamInt, Default: 20, Min: 20, Max: 100, AISettable: true},
			{Key: "instanceClass", Type: ParamEnum, Default: "db.t3.micro", Enum: []string{"db.t3.micro", "db.t3.small", "db.t3.medium"}, AISettable: true},
			{Key: "username", Type: ParamString, Default: "dbadmin", Pattern: patDBIdent, MaxLen: 40, AISettable: true},
			// Credentials are never model-chosen. The frontend ships a literal default
			// password; replacing it with a generated secret is a separate fix.
			{Key: "password", Type: ParamString, Default: "SuperSecurePassword123!", Pattern: `^[^"\\$\n]{0,128}$`, MaxLen: 128},
			{Key: "engineVersion", Type: ParamString, Default: "14.1", Pattern: `^[0-9]+(\.[0-9]+)?$`, MaxLen: 8},
			{Key: "vpcSecurityGroupIds", Type: ParamString, Default: "", Pattern: `^$`},
			{Key: "dbSubnetGroupName", Type: ParamString, Default: "", Pattern: `^$`},
		},
	},
	{
		ID: "aws_vpc", Tech: TechTerraform, Title: "Virtual Network (VPC)", Category: "Provisioning & Cloud",
		Description: "A virtual private cloud network.", AIGeneratable: true, GoCompiler: true,
		Outputs: []string{"vpc_id", "cidr_block"},
		Params: []Param{
			{Key: "vpcName", Type: ParamString, Default: "app_vpc", Pattern: patIdent, MaxLen: 40, AISettable: true, ResourceLabel: true},
			{Key: "cidrBlock", Type: ParamString, Default: "10.0.0.0/16", Pattern: patCIDR, MaxLen: 18, AISettable: true},
			{Key: "enableDnsHostnames", Type: ParamBool, Default: true, AISettable: true},
		},
	},
	{
		ID: "aws_subnet", Tech: TechTerraform, Title: "Network Subnet", Category: "Provisioning & Cloud",
		Description: "A subnet in a VPC.", AIGeneratable: true, GoCompiler: true,
		Outputs: []string{"subnet_id", "availability_zone"},
		Params: []Param{
			{Key: "subnetName", Type: ParamString, Default: "app_subnet_1a", Pattern: patIdent, MaxLen: 40, AISettable: true, ResourceLabel: true},
			{Key: "vpcId", Type: ParamString, Default: "aws_vpc.app_vpc.id", Pattern: `^[a-zA-Z0-9_.-]{0,80}$`},
			{Key: "cidrBlock", Type: ParamString, Default: "10.0.1.0/24", Pattern: patCIDR, MaxLen: 18, AISettable: true},
			{Key: "availabilityZone", Type: ParamString, Default: "us-east-1a", Pattern: patAZ, MaxLen: 16, AISettable: true},
			{Key: "mapPublicIp", Type: ParamBool, Default: true, AISettable: true},
		},
	},

	// Ansible. All are in the frontend generator (exportYaml.ts); the Go
	// fallback compiler covers only some of them (see GoCompiler).
	{
		ID: "update-packages", Tech: TechAnsible, Title: "Update Packages", Category: "Configuration & Setup",
		Description: "Updates package repositories and upgrades system modules.", AIGeneratable: true,
		Params: withHostParams(),
	},
	{
		ID: "nginx", Tech: TechAnsible, Title: "Install Nginx", Category: "Configuration & Setup",
		Description: "Installs the Nginx web server.", AIGeneratable: true,
		Params: withHostParams(),
	},
	{
		ID: "nodejs", Tech: TechAnsible, Title: "Install Node.js", Category: "Configuration & Setup",
		Description: "Installs Node.js and npm.", AIGeneratable: true,
		Params: withHostParams(),
	},
	{
		ID: "postgresql", Tech: TechAnsible, Title: "PostgreSQL Database", Category: "Configuration & Setup",
		Description: "Installs PostgreSQL and creates a deployment schema.", AIGeneratable: true,
		Params: withHostParams(
			Param{Key: "dbUser", Type: ParamString, Default: "postgres", Pattern: patUnixUser, MaxLen: 32, AISettable: true},
			Param{Key: "dbPass", Type: ParamString, Default: "postgres", Pattern: `^[^"\\$\n]{0,128}$`, MaxLen: 128, Description: "Credential; never model-chosen."},
		),
	},
	{
		ID: "open-port", Tech: TechAnsible, Title: "Open Port", Category: "Configuration & Setup",
		Description: "Opens a port in the host firewall.", AIGeneratable: true, GoCompiler: true,
		Params: withHostParams(
			Param{Key: "port", Type: ParamIntString, Default: "80", Min: 1, Max: 65535, Pattern: patPortNumber, MaxLen: 5, AISettable: true},
		),
	},
	{
		ID: "apt_install", Tech: TechAnsible, Title: "Install Packages (Apt)", Category: "Configuration & Setup",
		Description: "Installs system packages with apt.", AIGeneratable: true, GoCompiler: true,
		Params: withHostParams(
			Param{Key: "packages", Type: ParamString, Default: "curl, git, jq", Pattern: patPackages, MaxLen: 200, AISettable: true},
			Param{Key: "state", Type: ParamEnum, Default: "present", Enum: []string{"present", "latest"}, AISettable: true},
		),
	},
	{
		ID: "create_user", Tech: TechAnsible, Title: "Create System User", Category: "Configuration & Setup",
		Description: "Creates a Linux user.", AIGeneratable: true,
		Params: withHostParams(
			Param{Key: "username", Type: ParamString, Default: "deployer", Pattern: patUnixUser, MaxLen: 32, AISettable: true},
			Param{Key: "shell", Type: ParamEnum, Default: "/bin/bash", Enum: []string{"/bin/bash", "/bin/sh", "/usr/sbin/nologin"}, AISettable: true},
			Param{Key: "createHome", Type: ParamBool, Default: true, AISettable: true},
		),
	},
	{
		ID: "systemd_service", Tech: TechAnsible, Title: "Systemd Service", Category: "Configuration & Setup",
		Description: "Starts, stops or restarts a service.", AIGeneratable: true, GoCompiler: true,
		Params: withHostParams(
			Param{Key: "serviceName", Type: ParamString, Default: "nginx", Pattern: patUnitName, MaxLen: 64, AISettable: true},
			Param{Key: "state", Type: ParamEnum, Default: "started", Enum: []string{"started", "stopped", "restarted", "reloaded"}, AISettable: true},
			Param{Key: "enabled", Type: ParamBool, Default: true, AISettable: true},
		),
	},

	// Ansible nodes a model may not place. They run arbitrary commands, pull
	// arbitrary repositories, or move files and secrets on the user's hosts.
	{
		ID: "copy-env", Tech: TechAnsible, Title: "Copy .env File", Category: "Configuration & Setup",
		Description:   "Copies a local environment file onto remote hosts.",
		AIGeneratable: false, Params: withHostParams(),
	},
	{
		ID: "deploy-node-app", Tech: TechAnsible, Title: "Deploy Node App", Category: "Configuration & Setup",
		Description:   "Copies the connected repo onto the server, runs npm install and starts it.",
		AIGeneratable: false,
		Params: withHostParams(
			Param{Key: "startCommand", Type: ParamString, Default: "npm start", Pattern: `^[a-zA-Z0-9 ._:/-]{1,100}$`, MaxLen: 100, Description: "Becomes a shell command on the host."},
			Param{Key: "appPort", Type: ParamIntString, Default: "3000", Min: 1, Max: 65535, Pattern: patPortNumber, MaxLen: 5},
		),
	},
	{
		ID: "git_clone", Tech: TechAnsible, Title: "Git Clone", Category: "Configuration & Setup",
		Description:   "Clones a repository onto the host.",
		AIGeneratable: false, GoCompiler: true,
		Params: withHostParams(
			Param{Key: "repoUrl", Type: ParamString, Default: "https://github.com/whiparc/sample-app.git", Pattern: `^https://[a-zA-Z0-9._/-]{1,200}$`, MaxLen: 220, Description: "An attacker-chosen repository would later be built and run on the host."},
			Param{Key: "destPath", Type: ParamString, Default: "/var/www/app", Pattern: `^/[a-zA-Z0-9._/-]{1,100}$`, MaxLen: 101},
			Param{Key: "branch", Type: ParamString, Default: "main", Pattern: `^[a-zA-Z0-9._/-]{1,60}$`, MaxLen: 60},
		),
	},
	{
		ID: "shell_command", Tech: TechAnsible, Title: "Run Command", Category: "Configuration & Setup",
		Description:   "Runs an arbitrary shell command on the host.",
		AIGeneratable: false,
		Params: withHostParams(
			Param{Key: "command", Type: ParamString, Default: `echo "hello infrastructure"`, Pattern: `^[^\n]{1,500}$`, MaxLen: 500, Description: "Arbitrary shell. Never model-chosen."},
			Param{Key: "chdir", Type: ParamString, Default: "/tmp", Pattern: `^/[a-zA-Z0-9._/-]{0,100}$`, MaxLen: 101},
		),
	},
	{
		ID: "file_copy", Tech: TechAnsible, Title: "Copy File", Category: "Configuration & Setup",
		Description:   "Copies a file onto the host.",
		AIGeneratable: false, GoCompiler: true,
		Params: withHostParams(
			Param{Key: "srcPath", Type: ParamString, Default: "config.json", Pattern: `^[a-zA-Z0-9._/-]{1,150}$`, MaxLen: 150},
			Param{Key: "destPath", Type: ParamString, Default: "/var/www/app/config.json", Pattern: `^/[a-zA-Z0-9._/-]{1,150}$`, MaxLen: 151},
			Param{Key: "owner", Type: ParamString, Default: "www-data", Pattern: patUnixUser, MaxLen: 32},
			Param{Key: "mode", Type: ParamString, Default: "0644", Pattern: `^[0-7]{3,4}$`, MaxLen: 4},
		),
	},
}

// DeferredIDs are frontend library nodes deliberately outside the Phase 1
// catalog (GCP target, Kubernetes). The drift test requires every library node
// to be either in the catalog or listed here, so a new node cannot be forgotten.
var DeferredIDs = []string{
	"gcp_target",
	"k8s_deployment", "k8s_service", "k8s_configmap", "k8s_secret", "k8s_ingress", "k8s_pvc",
}

// edgeRules lists, per source catalog ID, the target catalog IDs an edge may
// join. The compilers read only VPC to subnet and VPC to security group edges;
// the rest express intent and ordering. Ansible tasks run in canvas order, so an
// edge between Ansible nodes is a sequencing hint.
var edgeRules = buildEdgeRules()

func buildEdgeRules() map[string]map[string]bool {
	rules := map[string]map[string]bool{}
	add := func(from string, to ...string) {
		if rules[from] == nil {
			rules[from] = map[string]bool{}
		}
		for _, t := range to {
			rules[from][t] = true
		}
	}

	add("aws_vpc", "aws_subnet", "aws_security_group")
	add("aws_subnet", "aws_instance.web_server", "aws_db_instance")
	add("aws_security_group", "aws_instance.web_server", "aws_db_instance")

	var ansible []string
	for _, n := range nodes {
		if n.Tech == TechAnsible && n.AIGeneratable {
			ansible = append(ansible, n.ID)
		}
	}
	add("aws_instance.web_server", ansible...)
	add("aws_db_instance", "postgresql")
	for _, from := range ansible {
		for _, to := range ansible {
			if from != to {
				add(from, to)
			}
		}
	}
	return rules
}

// All returns every catalog node, in a stable order.
func All() []Node {
	out := make([]Node, len(nodes))
	copy(out, nodes)
	return out
}

// Get returns the catalog node with the given catalog ID.
func Get(id string) (Node, bool) {
	for _, n := range nodes {
		if n.ID == id {
			return n, true
		}
	}
	return Node{}, false
}

// AIGeneratable returns the nodes a model may place, in catalog order.
func AIGeneratable() []Node {
	var out []Node
	for _, n := range nodes {
		if n.AIGeneratable {
			out = append(out, n)
		}
	}
	return out
}

// Defaults returns a fresh parameter map holding every parameter's default,
// which is the shape the canvas stores in node.data.parameters.
func Defaults(id string) map[string]any {
	n, ok := Get(id)
	if !ok {
		return nil
	}
	out := make(map[string]any, len(n.Params))
	for _, p := range n.Params {
		out[p.Key] = p.Default
	}
	return out
}

// Param returns the named parameter of a node.
func (n Node) Param(key string) (Param, bool) {
	for _, p := range n.Params {
		if p.Key == key {
			return p, true
		}
	}
	return Param{}, false
}

// AllowedEdge reports whether an edge from one catalog node to another is
// permitted. Both must be AI-generatable.
func AllowedEdge(from, to string) bool {
	return edgeRules[from][to]
}

// EdgeTargets returns the permitted targets for a source, sorted.
func EdgeTargets(from string) []string {
	var out []string
	for t := range edgeRules[from] {
		out = append(out, t)
	}
	sort.Strings(out)
	return out
}

// icons mirrors the icon of each frontend library entry; a drift test compares
// them. Kept apart from the manifest literals so those stay readable.
var icons = map[string]string{
	"aws_target":              "lucide:cloud",
	"aws_instance.web_server": "lucide:server",
	"aws_security_group":      "lucide:shield",
	"aws_s3_bucket":           "lucide:hard-drive",
	"aws_db_instance":         "lucide:database",
	"aws_vpc":                 "lucide:network",
	"aws_subnet":              "lucide:split",
	"update-packages":         "lucide:refresh-cw",
	"nginx":                   "lucide:globe",
	"nodejs":                  "lucide:terminal",
	"postgresql":              "lucide:database",
	"open-port":               "lucide:unlock",
	"copy-env":                "lucide:file-text",
	"deploy-node-app":         "lucide:rocket",
	"apt_install":             "lucide:package",
	"create_user":             "lucide:user-plus",
	"systemd_service":         "lucide:settings",
	"git_clone":               "lucide:git-pull-request",
	"shell_command":           "lucide:terminal",
	"file_copy":               "lucide:copy",
}

func init() {
	for i := range nodes {
		nodes[i].Icon = icons[nodes[i].ID]
	}
}
