package importer

import (
	"fmt"
	"strings"
)

type FileItem struct {
	Path    string `json:"path"`
	Content string `json:"content"`
}

func CompileCanvas(nodes []CanvasNode, edges []CanvasEdge) ([]FileItem, error) {
	var files []FileItem

	hasTerraform := false
	hasAnsible := false
	hasK8s := false

	for _, n := range nodes {
		if n.Data.Tech == "Terraform" {
			hasTerraform = true
		} else if n.Data.Tech == "Ansible" {
			hasAnsible = true
		} else if n.Data.Tech == "Kubernetes" {
			hasK8s = true
		}
	}

	if hasTerraform {
		// Collect all Target nodes present on the canvas
		var connectedTargets []CanvasNode
		for _, n := range nodes {
			if strings.HasSuffix(n.Data.Tech, "Target") || strings.HasPrefix(n.ID, "aws_target") || strings.HasPrefix(n.ID, "gcp_target") || strings.HasPrefix(n.ID, "azure_target") {
				connectedTargets = append(connectedTargets, n)
			}
		}

		// Default fallback: AWS Target
		if len(connectedTargets) == 0 {
			connectedTargets = append(connectedTargets, CanvasNode{
				ID: "aws_target_default",
				Data: NodeData{
					Tech:        "Target",
					Environment: "localstack",
					Region:      "us-east-1",
				},
			})
		}

		hasAws := false
		hasGcp := false
		hasAzure := false
		for _, t := range connectedTargets {
			if strings.HasPrefix(t.ID, "aws_target") {
				hasAws = true
			} else if strings.HasPrefix(t.ID, "gcp_target") {
				hasGcp = true
			} else if strings.HasPrefix(t.ID, "azure_target") {
				hasAzure = true
			}
		}

		var requiredProviders strings.Builder
		var providers strings.Builder

		if hasAws {
			isLiveAWS := false
			awsRegion := "us-east-1"
			for _, t := range connectedTargets {
				if strings.HasPrefix(t.ID, "aws_target") {
					if t.Data.Environment == "aws" {
						isLiveAWS = true
					}
					if t.Data.Region != "" {
						awsRegion = t.Data.Region
					}
					break
				}
			}

			requiredProviders.WriteString(`    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
`)

			if isLiveAWS {
				providers.WriteString(fmt.Sprintf(`provider "aws" {
  region = "%s"
}

`, awsRegion))
			} else {
				providers.WriteString(fmt.Sprintf(`provider "aws" {
  region                      = "%s"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    ec2 = "http://localhost:4566"
    s3  = "http://localhost:4566"
  }
}

`, awsRegion))
			}
		}

		if hasGcp {
			gcpProjectID := "whiparc-prod-12345"
			gcpRegion := "us-central1"
			gcpZone := "us-central1-a"
			for _, t := range connectedTargets {
				if strings.HasPrefix(t.ID, "gcp_target") {
					if t.Data.ProjectId != "" {
						gcpProjectID = t.Data.ProjectId
					}
					if t.Data.Region != "" {
						gcpRegion = t.Data.Region
					}
					if t.Data.GcpZone != "" {
						gcpZone = t.Data.GcpZone
					}
					break
				}
			}

			requiredProviders.WriteString(`    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
`)

			providers.WriteString(fmt.Sprintf(`provider "google" {
  project = "%s"
  region  = "%s"
  zone    = "%s"
}

`, gcpProjectID, gcpRegion, gcpZone))
		}

		if hasAzure {
			requiredProviders.WriteString(`    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
`)

			providers.WriteString(`provider "azurerm" {
  features {}
}

`)
		}

		var mainTf string
		mainTf = fmt.Sprintf(`terraform {
  required_providers {
%s  }
`, requiredProviders.String())

		awsTargetLocal := false
		for _, t := range connectedTargets {
			if strings.HasPrefix(t.ID, "aws_target") && t.Data.Environment == "localstack" {
				awsTargetLocal = true
				break
			}
		}
		if awsTargetLocal {
			mainTf += `
  backend "s3" {
    bucket                      = "whiparc-state-bucket"
    key                         = "terraform.tfstate"
    region                      = "us-east-1"
    endpoints                   = { s3 = "http://localhost:4566" }
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
  }
`
		}

		mainTf += fmt.Sprintf(`}

%s`, providers.String())

		var subnetBlock string
		if hasAws && awsTargetLocal {
			subnetBlock = `
data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}
`
			mainTf += subnetBlock
		}

		var resources strings.Builder
		var variablesTf strings.Builder
		var outputsTfContent strings.Builder

		variablesTf.WriteString("# Input variables for Terraform deployment\n\n")
		outputsTfContent.WriteString("# Output values to retrieve after deployment\n\n")

		if hasAws {
			awsTargetNode := CanvasNode{}
			for _, t := range connectedTargets {
				if strings.HasPrefix(t.ID, "aws_target") {
					awsTargetNode = t
					break
				}
			}
			awsRegionVal := "us-east-1"
			if awsTargetNode.Data.Region != "" {
				awsRegionVal = awsTargetNode.Data.Region
			}
			variablesTf.WriteString(fmt.Sprintf(`variable "aws_region" {
  type        = string
  default     = "%s"
  description = "Target AWS region for deployment"
}

`, awsRegionVal))
		}

		if hasGcp {
			gcpTarget := CanvasNode{}
			for _, t := range connectedTargets {
				if strings.HasPrefix(t.ID, "gcp_target") {
					gcpTarget = t
					break
				}
			}
			gcpProjectID := "whiparc-prod-12345"
			gcpRegion := "us-central1"
			gcpZone := "us-central1-a"
			if gcpTarget.Data.ProjectId != "" {
				gcpProjectID = gcpTarget.Data.ProjectId
			}
			if gcpTarget.Data.Region != "" {
				gcpRegion = gcpTarget.Data.Region
			}
			if gcpTarget.Data.GcpZone != "" {
				gcpZone = gcpTarget.Data.GcpZone
			}

			variablesTf.WriteString(fmt.Sprintf(`variable "gcp_project_id" {
  type    = string
  default = "%s"
}

variable "gcp_region" {
  type    = string
  default = "%s"
}

variable "gcp_zone" {
  type    = string
  default = "%s"
}

variable "gcp_ssh_pub_key" {
  type    = string
  default = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC2R1m2hJc6eC+7737t8t8O1/Y2N5hDkK1aP4+rD2mZ6bJ9mF7C8F9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2= dummy-whiparc-key"
}

`, gcpProjectID, gcpRegion, gcpZone))
		}

		if hasAzure {
			variablesTf.WriteString(`variable "azure_ssh_pub_key" {
  type    = string
  default = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC2R1m2hJc6eC+7737t8t8O1/Y2N5hDkK1aP4+rD2mZ6bJ9mF7C8F9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2= dummy-whiparc-key"
}

`)
		}

		for _, n := range nodes {
			if n.Data.Tech != "Terraform" {
				continue
			}

			p := n.Data.Parameters
			if p == nil {
				p = make(map[string]interface{})
			}

			if n.Data.IsCustom {
				customCode := n.Data.RawCode
				for k, v := range p {
					escapedVal := fmt.Sprintf("%v", v)
					if _, ok := v.(string); ok {
						escapedVal = fmt.Sprintf("\"%v\"", v)
					}
					customCode = strings.ReplaceAll(customCode, "var."+k, escapedVal)
				}
				resources.WriteString(fmt.Sprintf("\n# Custom Node: %s\n%s\n", n.Data.Label, customCode))
				continue
			}

			id := n.ID
			if strings.HasPrefix(id, "aws_instance") {
				if hasAws {
					name := getStringParam(p, "instanceName", n.Data.Label)
					ami := getStringParam(p, "amiId", "ami-785db401")
					instType := getStringParam(p, "instanceType", "t3.medium")
					volSize := getIntParam(p, "rootVolumeSize", 50)

					awsTargetNode := CanvasNode{}
					for _, t := range connectedTargets {
						if strings.HasPrefix(t.ID, "aws_target") {
							awsTargetNode = t
							break
						}
					}
					awsEnv := "localstack"
					if awsTargetNode.Data.Environment != "" {
						awsEnv = awsTargetNode.Data.Environment
					}
					var subnetLine string
					autoSubnetBlock := ""
					userSubnetID := getStringParam(p, "subnetId", "")
					if userSubnetID != "" {
						subnetLine = fmt.Sprintf("\n  subnet_id     = \"%s\"", userSubnetID)
					} else {
						firstSubnet := ""
						for _, other := range nodes {
							if strings.HasPrefix(other.ID, "aws_subnet") {
								subnetName := getStringParam(other.Data.Parameters, "subnetName", other.Data.Label)
								firstSubnet = fmt.Sprintf("aws_subnet.%s.id", subnetName)
								break
							}
						}
						if firstSubnet != "" {
							subnetLine = fmt.Sprintf("\n  subnet_id     = %s", firstSubnet)
						} else {
							var firstVpc *CanvasNode
							for idx, other := range nodes {
								if strings.HasPrefix(other.ID, "aws_vpc") {
									firstVpc = &nodes[idx]
									break
								}
							}
							if firstVpc != nil {
								vpcName := getStringParam(firstVpc.Data.Parameters, "vpcName", firstVpc.Data.Label)
								autoSubnetBlock = fmt.Sprintf(`
resource "aws_subnet" "whiparc_auto_subnet" {
  vpc_id                  = aws_vpc.%s.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  tags = {
    Name = "%s-auto-subnet"
  }
}

resource "aws_route_table_association" "whiparc_auto_subnet_assoc" {
  subnet_id      = aws_subnet.whiparc_auto_subnet.id
  route_table_id = aws_route_table.%s_rt.id
}
`, vpcName, vpcName, vpcName)
								subnetLine = "\n  subnet_id     = aws_subnet.whiparc_auto_subnet.id"
							} else if awsEnv == "localstack" {
								subnetLine = "\n  subnet_id     = tolist(data.aws_subnets.default.ids)[0]"
							}
						}
					}

					if autoSubnetBlock != "" {
						resources.WriteString(autoSubnetBlock)
					}

					var sgLine string
					for _, other := range nodes {
						if strings.HasPrefix(other.ID, "aws_security_group") {
							sgName := "web_sg"
							if otherP := other.Data.Parameters; otherP != nil {
								sgName = getStringParam(otherP, "sgName", "web_sg")
							}
							sgLine = fmt.Sprintf("\n  vpc_security_group_ids = [aws_security_group.%s.id]", sgName)
							break
						}
					}

					resources.WriteString(fmt.Sprintf(`
resource "aws_instance" "%s" {
  ami           = "%s"
  instance_type = "%s"%s%s

  root_block_device {
    volume_size = %d
  }

  tags = {
    Name = "%s"
  }
}
`, name, ami, instType, subnetLine, sgLine, volSize, name))

					outputsTfContent.WriteString(fmt.Sprintf(`output "%s_public_ip" {
  value       = aws_instance.%s.public_ip
  description = "Public IP address of the virtual machine"
}

`, name, name))
				}

				if hasGcp {
					instanceName := getStringParam(p, "gcpInstanceName", getStringParam(p, "instanceName", "web-server"))
					machineType := getStringParam(p, "gcpMachineType", "e2-micro")
					diskSizeGb := getIntParam(p, "gcpDiskSize", getIntParam(p, "rootVolumeSize", 50))
					gcpImage := getStringParam(p, "gcpImage", "ubuntu-os-cloud/ubuntu-2204-lts")

					resources.WriteString(fmt.Sprintf(`
resource "google_compute_network" "vpc_network" {
  name                    = "whiparc-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "whiparc-subnet"
  ip_cidr_range = "10.10.1.0/24"
  region        = var.gcp_region
  network       = google_compute_network.vpc_network.id
}

resource "google_compute_instance" "vm_instance" {
  name         = "%s"
  machine_type = "%s"
  zone         = var.gcp_zone

  boot_disk {
    initialize_params {
      image = "%s"
      size  = %d
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id
    access_config {
      // Ephemeral public IP for SSH access
    }
  }

  metadata = {
    ssh-keys = "ubuntu:${var.gcp_ssh_pub_key}"
  }
}
`, instanceName, machineType, gcpImage, diskSizeGb))

					outputsTfContent.WriteString(`output "gcp_instance_public_ip" {
  value       = google_compute_instance.vm_instance.network_interface.0.access_config.0.nat_ip
  description = "The public IP of the GCP VM instance"
}

`)
				}

				if hasAzure {
					vmName := getStringParam(p, "azureVmName", getStringParam(p, "instanceName", "web-vm"))
					vmSize := getStringParam(p, "azureVmSize", "Standard_B1s")
					diskSizeGb := getIntParam(p, "azureDiskSize", getIntParam(p, "rootVolumeSize", 50))
					publisher := getStringParam(p, "azurePublisher", "Canonical")
					offer := getStringParam(p, "azureOffer", "UbuntuServer")
					sku := getStringParam(p, "azureSku", "18.04-LTS")

					resources.WriteString(fmt.Sprintf(`
resource "azurerm_resource_group" "rg" {
  name     = "whiparc-rg"
  location = "East US"
}

resource "azurerm_virtual_network" "vnet" {
  name                = "whiparc-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
}

resource "azurerm_subnet" "subnet" {
  name                 = "whiparc-subnet"
  resource_group_name  = azurerm_resource_group.rg.name
  virtual_network_name = azurerm_virtual_network.vnet.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_public_ip" "pip" {
  name                = "%s-pip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Dynamic"
}

resource "azurerm_network_interface" "nic" {
  name                = "%s-nic"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.subnet.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.pip.id
  }
}

resource "azurerm_linux_virtual_machine" "vm" {
  name                = "%s"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  size                = "%s"
  admin_username      = "azureuser"
  network_interface_ids = [
    azurerm_network_interface.nic.id,
  ]

  admin_ssh_key {
    username   = "azureuser"
    public_key = var.azure_ssh_pub_key
  }

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
    disk_size_gb         = %d
  }

  source_image_reference {
    publisher = "%s"
    offer     = "%s"
    sku       = "%s"
    version   = "latest"
  }
}
`, vmName, vmName, vmName, vmSize, diskSizeGb, publisher, offer, sku))

					outputsTfContent.WriteString(`output "azure_instance_public_ip" {
  value       = azurerm_public_ip.pip.ip_address
  description = "The public IP of the Azure VM instance"
}

`)
				}

			} else if strings.HasPrefix(id, "aws_security_group") && hasAws {
				name := getStringParam(p, "sgName", "web_sg")
				desc := getStringParam(p, "description", "Allows HTTP/HTTPS inbound & SSH access")
				allowedCidr := getStringParam(p, "allowedCidr", "0.0.0.0/0")
				httpPort := getIntParam(p, "httpPort", 80)
				httpsPort := getIntParam(p, "httpsPort", 443)

				vpcRefLine := ""
				// Find incoming edge from VPC to Security Group
				for _, e := range edges {
					if e.Target == id && strings.HasPrefix(e.Source, "aws_vpc") {
						for _, vpcNode := range nodes {
							if vpcNode.ID == e.Source {
								vpcName := getStringParam(vpcNode.Data.Parameters, "vpcName", vpcNode.Data.Label)
								vpcRefLine = fmt.Sprintf("\n  vpc_id      = aws_vpc.%s.id", vpcName)
								break
							}
						}
						break
					}
				}
				// If no incoming edge but at least one VPC exists, use it
				if vpcRefLine == "" {
					for _, vpcNode := range nodes {
						if strings.HasPrefix(vpcNode.ID, "aws_vpc") {
							vpcName := getStringParam(vpcNode.Data.Parameters, "vpcName", vpcNode.Data.Label)
							vpcRefLine = fmt.Sprintf("\n  vpc_id      = aws_vpc.%s.id", vpcName)
							break
						}
					}
				}

				resources.WriteString(fmt.Sprintf(`
resource "aws_security_group" "%s" {
  name        = "%s"
  description = "%s"%s

  ingress {
    from_port   = %d
    to_port     = %d
    protocol    = "tcp"
    cidr_blocks = ["%s"]
  }

  ingress {
    from_port   = %d
    to_port     = %d
    protocol    = "tcp"
    cidr_blocks = ["%s"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
`, name, name, desc, vpcRefLine, httpPort, httpPort, allowedCidr, httpsPort, httpsPort, allowedCidr))

			} else if strings.HasPrefix(id, "aws_s3_bucket") && hasAws {
				name := getStringParam(p, "bucketName", n.Data.Label)
				resources.WriteString(fmt.Sprintf(`
resource "aws_s3_bucket" "%s" {
  bucket        = "%s"
  force_destroy = true
}
`, name, name))

				outputsTfContent.WriteString(fmt.Sprintf(`output "%s_bucket_arn" {
  value       = aws_s3_bucket.%s.arn
  description = "ARN of the S3 bucket"
}

`, name, name))

			} else if strings.HasPrefix(id, "aws_db_instance") && hasAws {
				name := getStringParam(p, "dbName", n.Data.Label)
				storage := getIntParam(p, "allocatedStorage", 20)
				class := getStringParam(p, "instanceClass", "db.t3.micro")
				user := getStringParam(p, "username", "admin")
				pass := getStringParam(p, "password", "dbpasswd123")
				ver := getStringParam(p, "engineVersion", "14.1")

				resources.WriteString(fmt.Sprintf(`
resource "aws_db_instance" "%s" {
  allocated_storage   = %d
  db_name             = "%s"
  engine              = "postgres"
  engine_version      = "%s"
  instance_class      = "%s"
  username            = "%s"
  password            = "%s"
  skip_final_snapshot = true
}
`, name, storage, name, ver, class, user, pass))

				outputsTfContent.WriteString(fmt.Sprintf(`output "%s_endpoint" {
  value       = aws_db_instance.%s.endpoint
  description = "Endpoint of the database instance"
}

`, name, name))

			} else if strings.HasPrefix(id, "aws_vpc") && hasAws {
				name := getStringParam(p, "vpcName", n.Data.Label)
				cidr := getStringParam(p, "cidrBlock", "10.0.0.0/16")

				resources.WriteString(fmt.Sprintf(`
resource "aws_vpc" "%s" {
  cidr_block           = "%s"
  enable_dns_hostnames = true
  tags = {
    Name = "%s"
  }
}

resource "aws_internet_gateway" "%s_igw" {
  vpc_id = aws_vpc.%s.id
  tags = {
    Name = "%s_igw"
  }
}

resource "aws_route_table" "%s_rt" {
  vpc_id = aws_vpc.%s.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.%s_igw.id
  }

  tags = {
    Name = "%s_rt"
  }
}
`, name, cidr, name, name, name, name, name, name, name, name))

			} else if strings.HasPrefix(id, "aws_subnet") && hasAws {
				name := getStringParam(p, "subnetName", n.Data.Label)
				cidr := getStringParam(p, "cidrBlock", "10.0.1.0/24")
				az := getStringParam(p, "availabilityZone", "us-east-1a")

				vpcRef := "data.aws_vpc.default.id"
				vpcNameForRt := ""

				// Find incoming edge from VPC to subnet
				for _, e := range edges {
					if e.Target == id && strings.HasPrefix(e.Source, "aws_vpc") {
						for _, vpcNode := range nodes {
							if vpcNode.ID == e.Source {
								vpcName := getStringParam(vpcNode.Data.Parameters, "vpcName", vpcNode.Data.Label)
								vpcRef = fmt.Sprintf("aws_vpc.%s.id", vpcName)
								vpcNameForRt = vpcName
								break
							}
						}
						break
					}
				}

				// If no incoming edge but at least one VPC exists, use it
				if vpcRef == "data.aws_vpc.default.id" {
					for _, vpcNode := range nodes {
						if strings.HasPrefix(vpcNode.ID, "aws_vpc") {
							vpcName := getStringParam(vpcNode.Data.Parameters, "vpcName", vpcNode.Data.Label)
							vpcRef = fmt.Sprintf("aws_vpc.%s.id", vpcName)
							vpcNameForRt = vpcName
							break
						}
					}
				}

				resources.WriteString(fmt.Sprintf(`
resource "aws_subnet" "%s" {
  vpc_id                  = %s
  cidr_block              = "%s"
  availability_zone       = "%s"
  map_public_ip_on_launch = true
  tags = {
    Name = "%s"
  }
}
`, name, vpcRef, cidr, az, name))

				if vpcNameForRt != "" {
					resources.WriteString(fmt.Sprintf(`
resource "aws_route_table_association" "%s_assoc" {
  subnet_id      = aws_subnet.%s.id
  route_table_id = aws_route_table.%s_rt.id
}
`, name, name, vpcNameForRt))
				}
			}
		}

		files = append(files, FileItem{Path: "terraform/main.tf", Content: mainTf + resources.String()})
		files = append(files, FileItem{Path: "terraform/variables.tf", Content: variablesTf.String()})
		files = append(files, FileItem{Path: "terraform/outputs.tf", Content: outputsTfContent.String()})
	}

	if hasAnsible {
		playbook := `---
- name: Automated Infrastructure Provisioning
  hosts: all
  become: yes
  tasks:
`
		var tasks strings.Builder
		for _, n := range nodes {
			if n.Data.Tech != "Ansible" {
				continue
			}

			p := n.Data.Parameters
			if p == nil {
				p = make(map[string]interface{})
			}

			if n.Data.IsCustom {
				customTasks := n.Data.RawCode
				lines := strings.Split(customTasks, "\n")
				for _, line := range lines {
					if strings.TrimSpace(line) != "" {
						tasks.WriteString("    " + line + "\n")
					}
				}
				continue
			}

			id := n.ID
			if strings.HasPrefix(id, "apt_install") {
				pkgs := getStringParam(p, "packages", "nginx, curl, git")
				pkgList := strings.Split(pkgs, ",")
				tasks.WriteString(fmt.Sprintf(`    - name: Install system packages
      ansible.builtin.package:
        name:
`))
				for _, pkg := range pkgList {
					tasks.WriteString(fmt.Sprintf("          - %s\n", strings.TrimSpace(pkg)))
				}
				tasks.WriteString("        state: present\n\n")

			} else if strings.HasPrefix(id, "file_copy") {
				src := getStringParam(p, "srcPath", "/tmp/source")
				dest := getStringParam(p, "destPath", "/var/www/dest")
				owner := getStringParam(p, "owner", "www-data")
				mode := getStringParam(p, "mode", "0644")

				tasks.WriteString(fmt.Sprintf(`    - name: Copy file to target path
      ansible.builtin.copy:
        src: "%s"
        dest: "%s"
        owner: "%s"
        mode: "%s"

`, src, dest, owner, mode))

			} else if strings.HasPrefix(id, "open-port") {
				port := getStringParam(p, "port", "80")
				tasks.WriteString(fmt.Sprintf(`    # Ensure firewall package is installed
    - name: Install UFW (Debian)
      ansible.builtin.package:
        name: ufw
        state: present
      when: ansible_os_family == 'Debian'

    # Open Port in UFW (Debian/Ubuntu)
    - name: Open Port %s in UFW (Debian)
      ansible.builtin.ufw:
        rule: allow
        port: "%s"
        proto: tcp
      when: ansible_os_family == 'Debian'
      ignore_errors: yes

    - name: Install firewalld (RedHat)
      ansible.builtin.package:
        name: firewalld
        state: present
      when: ansible_os_family == 'RedHat'

    - name: Ensure firewalld is running (RedHat)
      ansible.builtin.service:
        name: firewalld
        state: started
        enabled: yes
      when: ansible_os_family == 'RedHat'

    # Open Port in firewalld (RedHat/Amazon Linux)
    - name: Open Port %s in firewalld (RedHat)
      ansible.builtin.firewalld:
        port: "%s/tcp"
        permanent: yes
        state: enabled
        immediate: yes
      when: ansible_os_family == 'RedHat'
      ignore_errors: yes

`, port, port, port, port))

			} else if strings.HasPrefix(id, "git_clone") {
				repo := getStringParam(p, "repoUrl", "")
				dest := getStringParam(p, "destPath", "")
				branch := getStringParam(p, "branch", "main")

				tasks.WriteString(fmt.Sprintf(`    - name: Clone repo
      ansible.builtin.git:
        repo: "%s"
        dest: "%s"
        version: "%s"
        clone: yes
        update: yes

`, repo, dest, branch))

			} else if strings.HasPrefix(id, "systemd_service") {
				name := getStringParam(p, "serviceName", "nginx")
				state := getStringParam(p, "state", "started")

				tasks.WriteString(fmt.Sprintf(`    - name: Manage service
      ansible.builtin.systemd:
        name: "%s"
        state: "%s"
        enabled: yes

`, name, state))
			}
		}

		files = append(files, FileItem{Path: "ansible/playbook.yml", Content: playbook + tasks.String()})
		files = append(files, FileItem{Path: "ansible/hosts.ini", Content: `[webservers]
web_server ansible_host=localhost ansible_port=2222 ansible_user=ubuntu
`})
	}

	if hasK8s {
		var manifests strings.Builder
		for idx, n := range nodes {
			if n.Data.Tech != "Kubernetes" {
				continue
			}

			p := n.Data.Parameters
			if p == nil {
				p = make(map[string]interface{})
			}

			if idx > 0 {
				manifests.WriteString("\n---\n")
			}

			if n.Data.IsCustom {
				manifests.WriteString(n.Data.RawCode)
				continue
			}

			id := n.ID
			if strings.HasPrefix(id, "k8s_deployment") {
				name := getStringParam(p, "deploymentName", n.Data.Label)
				reps := getIntParam(p, "replicas", 1)
				img := getStringParam(p, "imageName", "nginx:alpine")
				port := getIntParam(p, "containerPort", 80)

				manifests.WriteString(fmt.Sprintf(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: %s
spec:
  replicas: %d
  selector:
    matchLabels:
      app: %s
  template:
    metadata:
      labels:
        app: %s
    spec:
      containers:
      - name: app
        image: %s
        ports:
        - containerPort: %d
`, name, reps, name, name, img, port))

			} else if strings.HasPrefix(id, "k8s_service") {
				name := getStringParam(p, "serviceName", n.Data.Label)
				t := getStringParam(p, "serviceType", "ClusterIP")
				port := getIntParam(p, "port", 80)
				targetPort := getIntParam(p, "targetPort", 80)

				manifests.WriteString(fmt.Sprintf(`apiVersion: v1
kind: Service
metadata:
  name: %s
spec:
  type: %s
  ports:
  - port: %d
    targetPort: %d
  selector:
    app: %s
`, name, t, port, targetPort, name))

			} else if strings.HasPrefix(id, "k8s_configmap") {
				name := getStringParam(p, "configMapName", n.Data.Label)
				key := getStringParam(p, "dataKey", "APP_ENV")
				val := getStringParam(p, "dataValue", "production")

				manifests.WriteString(fmt.Sprintf(`apiVersion: v1
kind: ConfigMap
metadata:
  name: %s
data:
  %s: "%s"
`, name, key, val))

			} else if strings.HasPrefix(id, "k8s_secret") {
				name := getStringParam(p, "secretName", n.Data.Label)
				key := getStringParam(p, "secretKey", "DB_PASS")
				val := getStringParam(p, "secretValue", "secret123")

				manifests.WriteString(fmt.Sprintf(`apiVersion: v1
kind: Secret
metadata:
  name: %s
type: Opaque
data:
  %s: "%s"
`, name, key, val))
			}
		}

		files = append(files, FileItem{Path: "k8s/deployment.yaml", Content: manifests.String()})
	}

	return files, nil
}

func getStringParam(p map[string]interface{}, key string, def string) string {
	if val, ok := p[key]; ok {
		if s, ok := val.(string); ok && s != "" {
			return s
		}
	}
	return def
}

func getIntParam(p map[string]interface{}, key string, def int) int {
	if val, ok := p[key]; ok {
		switch v := val.(type) {
		case int:
			return v
		case float64:
			return int(v)
		}
	}
	return def
}
