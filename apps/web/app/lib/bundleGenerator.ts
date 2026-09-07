import { Node, Edge } from '@xyflow/react';
import { generateAnsibleYAML } from './exportYaml';

// Canvas node `data.parameters` is a loosely-shaped, user-editable JSON bag —
// different node "tech" types (Terraform/Ansible/Kubernetes) populate different
// subsets of these fields, so everything here is optional. The index signature
// covers custom-node template substitution, which reads/writes arbitrary keys.
export interface Tag {
  key: string;
  value: string;
}

interface NodeParams {
  // AWS EC2 instance
  instanceName?: string;
  amiId?: string;
  instanceType?: string;
  rootVolumeSize?: number;
  tags?: Tag[];
  subnetId?: string;
  securityGroupId?: string;
  // AWS security group
  sgName?: string;
  description?: string;
  allowedCidr?: string;
  httpPort?: number;
  httpsPort?: number;
  sshEnabled?: boolean;
  ingressPorts?: string;
  vpcId?: string;
  // AWS S3 bucket
  bucketName?: string;
  forceDestroy?: boolean;
  versioningEnabled?: boolean;
  // AWS RDS instance
  dbName?: string;
  allocatedStorage?: number;
  instanceClass?: string;
  username?: string;
  password?: string;
  engineVersion?: string;
  dbSubnetGroupName?: string;
  vpcSecurityGroupIds?: string;
  // AWS VPC
  vpcName?: string;
  cidrBlock?: string;
  enableDnsHostnames?: boolean;
  // AWS subnet
  subnetName?: string;
  availabilityZone?: string;
  mapPublicIp?: boolean;
  // GCP compute instance
  gcpInstanceName?: string;
  gcpMachineType?: string;
  gcpDiskSize?: number;
  gcpImage?: string;
  // Azure VM
  azureVmName?: string;
  azureVmSize?: string;
  azureDiskSize?: number;
  azurePublisher?: string;
  azureOffer?: string;
  azureSku?: string;
  // Kubernetes deployment
  deploymentName?: string;
  replicas?: number;
  imageName?: string;
  containerPort?: number;
  cpuLimit?: string;
  memoryLimit?: string;
  // Kubernetes service
  serviceName?: string;
  serviceType?: string;
  port?: number;
  targetPort?: number;
  // Kubernetes configmap
  configMapName?: string;
  dataKey?: string;
  dataValue?: string;
  // Kubernetes secret
  secretName?: string;
  secretKey?: string;
  secretValue?: string;
  // Kubernetes ingress
  ingressName?: string;
  host?: string;
  path?: string;
  servicePort?: number;
  // Kubernetes PVC
  pvcName?: string;
  storageSize?: string;
  storageClass?: string;
  // Ansible node fallback host wiring
  ansibleUser?: string;
  ansibleHost?: string;
  [key: string]: unknown;
}

// Shape of a canvas node's `data` payload as read across bundle generation.
interface CanvasNodeData {
  tech?: string;
  label?: string;
  environment?: string;
  region?: string;
  gcpZone?: string;
  projectId?: string;
  isCustom?: boolean;
  rawCode?: string;
  codeType?: string;
  parameters?: NodeParams;
  [key: string]: unknown;
}

export interface FileItem {
  path: string;
  name: string;
  language: string;
  icon: string;
  iconColor?: string;
  lines: number;
  size: string;
  content: string;
}

export interface TerraformFiles {
  mainTf: string;
  variablesTf: string;
  outputsTf: string;
}

export function generateTerraformFiles(nodes: Node[], edges: Edge[] = []): TerraformFiles {
  // Collect all Target nodes present on the canvas
  let connectedTargets: Node[] = nodes.filter(n => (n.data as unknown as CanvasNodeData)?.tech === 'Target' || n.id.startsWith('aws_target') || n.id.startsWith('gcp_target') || n.id.startsWith('azure_target'));

  // Default fallback if no target node exists on canvas
  if (connectedTargets.length === 0) {
    connectedTargets = [{
      id: 'aws_target_default',
      data: { tech: 'Target', environment: 'localstack', region: 'us-east-1' }
    } as unknown as Node];
  }

  const hasAws = connectedTargets.some(t => t.id.startsWith('aws_target'));
  const hasGcp = connectedTargets.some(t => t.id.startsWith('gcp_target'));
  const hasAzure = connectedTargets.some(t => t.id.startsWith('azure_target'));

  let requiredProviders = '';
  let providers = '';

  if (hasAws) {
    const awsTarget = connectedTargets.find(t => t.id.startsWith('aws_target'));
    const awsRegion = (awsTarget?.data as unknown as CanvasNodeData)?.region || 'us-east-1';
    const environment = (awsTarget?.data as unknown as CanvasNodeData)?.environment || 'localstack';

    requiredProviders += `    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }\n`;

    if (environment === 'localstack') {
      providers += `provider "aws" {
  region                      = "${awsRegion}"
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
}\n\n`;
    } else {
      providers += `provider "aws" {
  region = "${awsRegion}"
}\n\n`;
    }
  }

  if (hasGcp) {
    requiredProviders += `    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }\n`;

    providers += `provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
  zone    = var.gcp_zone
}\n\n`;
  }

  if (hasAzure) {
    requiredProviders += `    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }\n`;

    providers += `provider "azurerm" {
  features {}
}\n\n`;
  }

  let providerBlock = `terraform {
  required_providers {
${requiredProviders}  }
`;

  const awsTarget = connectedTargets.find(t => t.id.startsWith('aws_target'));
  if (awsTarget && (awsTarget?.data as unknown as CanvasNodeData)?.environment === 'localstack') {
    const awsRegion = (awsTarget?.data as unknown as CanvasNodeData)?.region || 'us-east-1';
    providerBlock += `
  backend "s3" {
    bucket                      = "whiparc-state-bucket"
    key                         = "terraform.tfstate"
    region                      = "${awsRegion}"
    endpoints                   = { s3 = "http://localhost:4566" }
    use_path_style              = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
  }
`;
  }

  providerBlock += `}`;

  const tfNodes = nodes.filter(n => (n.data as unknown as CanvasNodeData)?.tech === 'Terraform');
  const dummySshKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQC2R1m2hJc6eC+7737t8t8O1/Y2N5hDkK1aP4+rD2mZ6bJ9mF7C8F9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2m8B9eD0rC2= dummy-whiparc-key";
  let tfResourcesBlock = '';
  let subnetBlock = '';
  let variablesTf = '# Input variables for Terraform deployment\n\n';
  let outputsTfContent = '# Output values to retrieve after deployment\n\n';

  // Read AWS instance params if AWS is used
  let awsInstanceType = 't3.medium';
  const instanceNode = nodes.find(n => n.id.startsWith('aws_instance.web_server'));
  const p: NodeParams = (instanceNode?.data as unknown as CanvasNodeData)?.parameters || {};
  if (p.instanceType) {
    awsInstanceType = p.instanceType;
  }

  if (hasAws) {
    variablesTf += `variable "aws_region" {
  type        = string
  default     = "${awsTarget && (awsTarget?.data as unknown as CanvasNodeData)?.region || 'us-east-1'}"
  description = "Target AWS region for deployment"
}

variable "instance_type" {
  type        = string
  default     = "${awsInstanceType}"
  description = "EC2 instance size"
}

variable "aws_ssh_pub_key" {
  type    = string
  default = "${dummySshKey}"
}\n\n`;
  }


  if (hasGcp) {
    const gcpTarget = connectedTargets.find(t => t.id.startsWith('gcp_target'));
    const gcpRegion = (gcpTarget?.data as unknown as CanvasNodeData)?.region || 'us-central1';
    const gcpZone = (gcpTarget?.data as unknown as CanvasNodeData)?.gcpZone || 'us-central1-a';
    const gcpProjectId = (gcpTarget?.data as unknown as CanvasNodeData)?.projectId || 'whiparc-prod-12345';

    variablesTf += `variable "gcp_project_id" {
  type    = string
  default = "${gcpProjectId}"
}

variable "gcp_region" {
  type    = string
  default = "${gcpRegion}"
}

variable "gcp_zone" {
  type    = string
  default = "${gcpZone}"
}

variable "gcp_ssh_pub_key" {
  type    = string
  default = "${dummySshKey}"
}\n\n`;
  }

  if (hasAzure) {
    variablesTf += `variable "azure_ssh_pub_key" {
  type    = string
  default = "${dummySshKey}"
}\n\n`;
  }

  tfNodes.forEach(node => {
    const id = node.id;
    const p: NodeParams = (node.data as unknown as CanvasNodeData)?.parameters || {};

    if (id.startsWith('aws_instance.web_server')) {
      if (hasAws) {
        const name = p.instanceName || 'web_server';
        const ami = p.amiId || 'ami-785db401';
        const type = p.instanceType || 't3.medium';
        const rootVolume = p.rootVolumeSize || 50;
        const tagsList = p.tags || [{ key: 'Environment', value: 'prod' }, { key: 'Role', value: 'web' }];
        const tagLines = tagsList.map((t: Tag) => `${t.key} = "${t.value}"`).join('\n    ');

        const awsTargetNode = connectedTargets.find(t => t.id.startsWith('aws_target'));
        const awsEnv = (awsTargetNode?.data as unknown as CanvasNodeData)?.environment || 'localstack';
        let subnetLine = '';
        if (p.subnetId) {
          const val = p.subnetId.trim();
          if (val.startsWith('aws_subnet.') || val.startsWith('var.')) {
            subnetLine = `\n  subnet_id     = ${val}`;
          } else {
            subnetLine = `\n  subnet_id     = "${val}"`;
          }
        } else {
          // Check for incoming edge from a subnet node
          const incomingSubnetEdges = edges.filter(e => e.target === id && e.source.startsWith('aws_subnet'));
          if (incomingSubnetEdges.length > 0) {
            const subnetNode = nodes.find(n => n.id === incomingSubnetEdges[0].source);
            const subnetName = ((subnetNode?.data as unknown as CanvasNodeData)?.parameters?.subnetName) || 'app_subnet_1a';
            subnetLine = `\n  subnet_id     = aws_subnet.${subnetName}.id`;
          } else {
            // Check if there is any subnet node on the canvas
            const firstSubnet = tfNodes.find(n => n.id.startsWith('aws_subnet'));
            if (firstSubnet) {
              const subnetName = ((firstSubnet.data as unknown as CanvasNodeData)?.parameters?.subnetName) || 'app_subnet_1a';
              subnetLine = `\n  subnet_id     = aws_subnet.${subnetName}.id`;
            } else {
              // Check if a VPC exists on the canvas. If so, automatically generate a subnet inside it
              const firstVpc = tfNodes.find(n => n.id.startsWith('aws_vpc'));
              if (firstVpc) {
                const vpcName = ((firstVpc.data as unknown as CanvasNodeData)?.parameters?.vpcName) || 'app_vpc';
                subnetBlock = `resource "aws_subnet" "whiparc_auto_subnet" {
  vpc_id                  = aws_vpc.${vpcName}.id
  cidr_block              = "10.0.1.0/24"
  map_public_ip_on_launch = true
  tags = {
    Name = "${vpcName}-auto-subnet"
  }
}

resource "aws_route_table_association" "whiparc_auto_subnet_assoc" {
  subnet_id      = aws_subnet.whiparc_auto_subnet.id
  route_table_id = aws_route_table.${vpcName}_rt.id
}`;
                subnetLine = `\n  subnet_id     = aws_subnet.whiparc_auto_subnet.id`;
              } else {
                // Default fallback (Default VPC)
                subnetBlock = `data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}`;
                subnetLine = `\n  subnet_id     = tolist(data.aws_subnets.default.ids)[0]`;
              }
            }
          }
        }

        let sgLine = '';
        if (p.securityGroupId) {
          const sgVal = p.securityGroupId.trim();
          if (sgVal.startsWith('aws_security_group.') || sgVal.startsWith('var.')) {
            sgLine = `\n  vpc_security_group_ids = [${sgVal}]`;
          } else {
            sgLine = `\n  vpc_security_group_ids = ["${sgVal}"]`;
          }
        } else {
          // Check for incoming edge from a security group to this EC2 node
          const incomingSgEdges = edges.filter(e => e.target === id && e.source.startsWith('aws_security_group'));
          if (incomingSgEdges.length > 0) {
            const sgNode = nodes.find(n => n.id === incomingSgEdges[0].source);
            const sgName = ((sgNode?.data as unknown as CanvasNodeData)?.parameters?.sgName) || 'web_sg';
            sgLine = `\n  vpc_security_group_ids = [aws_security_group.${sgName}.id]`;
          } else {
            // Fallback to old behavior: if any sg node exists
            const hasSg = tfNodes.some(n => n.id.startsWith('aws_security_group'));
            if (hasSg) {
              const sgNode = tfNodes.find(n => n.id.startsWith('aws_security_group'));
              const sgName = ((sgNode?.data as unknown as CanvasNodeData)?.parameters?.sgName) || 'web_sg';
              sgLine = `\n  vpc_security_group_ids = [aws_security_group.${sgName}.id]`;
            }
          }
        }

        tfResourcesBlock += `resource "aws_key_pair" "whiparc_key" {
  key_name   = "whiparc-deploy-key"
  public_key = var.aws_ssh_pub_key
}

resource "aws_instance" "${name}" {
  ami           = "${ami}"
  instance_type = "${type}"${subnetLine}${sgLine}
  key_name      = aws_key_pair.whiparc_key.key_name

  root_block_device {
    volume_size = ${rootVolume}
  }

  tags = {
    Name = "${name}"
    ${tagLines}
  }
}\n\n`;

        outputsTfContent += `output "${name}_public_ip" {
  value       = aws_instance.${name}.public_ip
  description = "Public IP address of the virtual machine"
}\n\n`;
      }

      if (hasGcp) {
        const instanceName = p.gcpInstanceName || p.instanceName || 'web-server';
        const machineType = p.gcpMachineType || 'e2-micro';
        const diskSizeGb = p.gcpDiskSize || p.rootVolumeSize || 50;
        const gcpImage = p.gcpImage || 'ubuntu-os-cloud/ubuntu-2204-lts';

        tfResourcesBlock += `resource "google_compute_network" "vpc_network" {
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
  name         = "${instanceName}"
  machine_type = "${machineType}"
  zone         = var.gcp_zone

  boot_disk {
    initialize_params {
      image = "${gcpImage}"
      size  = ${diskSizeGb}
    }
  }

  network_interface {
    subnetwork = google_compute_subnetwork.subnet.id
    access_config {
      // Ephemeral public IP for SSH access
    }
  }

  metadata = {
    ssh-keys = "ubuntu:\${var.gcp_ssh_pub_key}"
  }
}\n\n`;

        outputsTfContent += `output "gcp_instance_public_ip" {
  value       = google_compute_instance.vm_instance.network_interface.0.access_config.0.nat_ip
  description = "The public IP of the GCP VM instance"
}\n\n`;
      }

      if (hasAzure) {
        const vmName = p.azureVmName || p.instanceName || 'web-vm';
        const vmSize = p.azureVmSize || 'Standard_B1s';
        const diskSizeGb = p.azureDiskSize || p.rootVolumeSize || 50;
        const publisher = p.azurePublisher || 'Canonical';
        const offer = p.azureOffer || 'UbuntuServer';
        const sku = p.azureSku || '18.04-LTS';

        tfResourcesBlock += `resource "azurerm_resource_group" "rg" {
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
  name                = "${vmName}-pip"
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  allocation_method   = "Dynamic"
}

resource "azurerm_network_interface" "nic" {
  name                = "${vmName}-nic"
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
  name                = "${vmName}"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  size                = "${vmSize}"
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
    disk_size_gb         = ${diskSizeGb}
  }

  source_image_reference {
    publisher = "${publisher}"
    offer     = "${offer}"
    sku       = "${sku}"
    version   = "latest"
  }
}
\n\n`;

        outputsTfContent += `output "azure_instance_public_ip" {
  value       = azurerm_public_ip.pip.ip_address
  description = "The public IP of the Azure VM instance"
}\n\n`;
      }
    }
    else if (id.startsWith('aws_security_group') && hasAws) {
      const name = p.sgName || 'web_sg';
      const desc = p.description || 'Allows HTTP/HTTPS inbound & SSH access';
      const allowedCidr = p.allowedCidr || '0.0.0.0/0';

      let ingressRules = '';
      if (p.httpPort !== undefined || p.httpsPort !== undefined) {
        const httpPort = p.httpPort ?? 80;
        const httpsPort = p.httpsPort ?? 443;
        const sshEnabled = p.sshEnabled !== false;

        ingressRules += `  ingress {
    from_port   = ${httpPort}
    to_port     = ${httpPort}
    protocol    = "tcp"
    cidr_blocks = ["${allowedCidr}"]
  }

  ingress {
    from_port   = ${httpsPort}
    to_port     = ${httpsPort}
    protocol    = "tcp"
    cidr_blocks = ["${allowedCidr}"]
  }`;

        if (sshEnabled) {
          ingressRules += `

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["${allowedCidr}"]
  }`;
        }
      } else {
        const portsStr = p.ingressPorts || '80, 443, 22';
        const ports = portsStr.split(',').map((x: string) => x.trim()).filter((x: string) => x !== '' && !isNaN(Number(x)));
        ports.forEach((port: string) => {
          ingressRules += `  ingress {
    from_port   = ${port}
    to_port     = ${port}
    protocol    = "tcp"
    cidr_blocks = ["${allowedCidr}"]
  }\n\n`;
        });
      }

      let vpcLine = '';
      if (p.vpcId) {
        const vpcVal = p.vpcId.trim();
        if (vpcVal.startsWith('aws_vpc.') || vpcVal.startsWith('var.')) {
          vpcLine = `\n  vpc_id      = ${vpcVal}`;
        } else {
          vpcLine = `\n  vpc_id      = "${vpcVal}"`;
        }
      } else {
        // Check for incoming edge from a VPC node to this Security Group node
        const incomingVpcEdges = edges.filter(e => e.target === id && e.source.startsWith('aws_vpc'));
        if (incomingVpcEdges.length > 0) {
          const vpcNode = nodes.find(n => n.id === incomingVpcEdges[0].source);
          const vpcName = ((vpcNode?.data as unknown as CanvasNodeData)?.parameters?.vpcName) || 'app_vpc';
          vpcLine = `\n  vpc_id      = aws_vpc.${vpcName}.id`;
        } else {
          // If any VPC node exists on the canvas, default to it
          const firstVpc = tfNodes.find(n => n.id.startsWith('aws_vpc'));
          if (firstVpc) {
            const vpcName = ((firstVpc.data as unknown as CanvasNodeData)?.parameters?.vpcName) || 'app_vpc';
            vpcLine = `\n  vpc_id      = aws_vpc.${vpcName}.id`;
          }
        }
      }

      const hasSshRule = ingressRules.includes('from_port   = 22') || ingressRules.includes('from_port = 22') || ingressRules.includes('from_port   = 22\n') || ingressRules.includes('from_port = 22\n');
      let sshRuleStr = '';
      if (!hasSshRule) {
        sshRuleStr = `\n  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }\n`;
      }

      tfResourcesBlock += `resource "aws_security_group" "${name}" {
  name        = "${name}"
  description = "${desc}"${vpcLine}

${ingressRules}${sshRuleStr}
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}\n\n`;
    }
    else if (id.startsWith('aws_s3_bucket') && hasAws) {
      const name = p.bucketName || 'whiparc-user-bucket';
      const forceDestroy = p.forceDestroy !== false;
      const versioning = p.versioningEnabled !== false;

      tfResourcesBlock += `resource "aws_s3_bucket" "${name}" {
  bucket        = "${name}"
  force_destroy = ${forceDestroy}
}

resource "aws_s3_bucket_versioning" "${name}_versioning" {
  bucket = aws_s3_bucket.${name}.id
  versioning_configuration {
    status = "${versioning ? 'Enabled' : 'Suspended'}"
  }
}\n\n`;
    }
    else if (id.startsWith('aws_db_instance') && hasAws) {
      const name = p.dbName || 'appdb';
      const storage = p.allocatedStorage || 20;
      const instanceClass = p.instanceClass || 'db.t3.micro';
      const username = p.username || 'dbadmin';
      const password = p.password || 'SuperSecurePassword123!';
      const engineVersion = p.engineVersion || '14.1';

      let extraParams = '';
      if (p.dbSubnetGroupName) {
        const val = p.dbSubnetGroupName.trim();
        if (val.startsWith('aws_') || val.startsWith('var.')) {
          extraParams += `\n  db_subnet_group_name = ${val}`;
        } else {
          extraParams += `\n  db_subnet_group_name = "${val}"`;
        }
      }
      if (p.vpcSecurityGroupIds) {
        const val = p.vpcSecurityGroupIds.trim();
        if (val.startsWith('aws_') || val.startsWith('var.')) {
          extraParams += `\n  vpc_security_group_ids = [${val}]`;
        } else {
          extraParams += `\n  vpc_security_group_ids = ["${val}"]`;
        }
      } else {
        // Check for incoming edge from a security group to RDS
        const incomingSgEdges = edges.filter(e => e.target === id && e.source.startsWith('aws_security_group'));
        if (incomingSgEdges.length > 0) {
          const sgNode = nodes.find(n => n.id === incomingSgEdges[0].source);
          const sgName = ((sgNode?.data as unknown as CanvasNodeData)?.parameters?.sgName) || 'web_sg';
          extraParams += `\n  vpc_security_group_ids = [aws_security_group.${sgName}.id]`;
        }
      }

      tfResourcesBlock += `resource "aws_db_instance" "${name}" {
  allocated_storage   = ${storage}
  db_name             = "${name}"
  engine              = "postgres"
  engine_version      = "${engineVersion}"
  instance_class      = "${instanceClass}"
  username            = "${username}"
  password            = "${password}"
  skip_final_snapshot = true${extraParams}
}\n\n`;
    }
    else if (id.startsWith('aws_vpc') && hasAws) {
      const name = p.vpcName || 'app_vpc';
      const cidr = p.cidrBlock || '10.0.0.0/16';
      const dns = p.enableDnsHostnames !== false;

      tfResourcesBlock += `resource "aws_vpc" "${name}" {
  cidr_block           = "${cidr}"
  enable_dns_hostnames = ${dns}
  tags = {
    Name = "${name}"
  }
}

resource "aws_internet_gateway" "${name}_igw" {
  vpc_id = aws_vpc.${name}.id
  tags = {
    Name = "${name}_igw"
  }
}

resource "aws_route_table" "${name}_rt" {
  vpc_id = aws_vpc.${name}.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.${name}_igw.id
  }

  tags = {
    Name = "${name}_rt"
  }
}\n\n`;
    }
    else if (id.startsWith('aws_subnet') && hasAws) {
      const name = p.subnetName || 'app_subnet_1a';
      let vpc = '';
      let vpcNameForRt = '';
      if (p.vpcId) {
        const vpcVal = p.vpcId.trim();
        if (vpcVal.startsWith('aws_vpc.') || vpcVal.startsWith('var.')) {
          vpc = vpcVal;
          if (vpcVal.startsWith('aws_vpc.')) {
            const parts = vpcVal.split('.');
            if (parts.length > 1) {
              vpcNameForRt = parts[1];
            }
          }
        } else {
          vpc = `"${vpcVal}"`;
        }
      } else {
        // Check for incoming edge from a VPC node to this subnet node
        const incomingVpcEdges = edges.filter(e => e.target === id && e.source.startsWith('aws_vpc'));
        if (incomingVpcEdges.length > 0) {
          const vpcNode = nodes.find(n => n.id === incomingVpcEdges[0].source);
          const vpcName = ((vpcNode?.data as unknown as CanvasNodeData)?.parameters?.vpcName) || 'app_vpc';
          vpc = `aws_vpc.${vpcName}.id`;
          vpcNameForRt = vpcName;
        } else {
          // Fallback to first VPC found or placeholder
          const firstVpc = tfNodes.find(n => n.id.startsWith('aws_vpc'));
          if (firstVpc) {
            const vpcName = ((firstVpc?.data as unknown as CanvasNodeData)?.parameters?.vpcName) || 'app_vpc';
            vpc = `aws_vpc.${vpcName}.id`;
            vpcNameForRt = vpcName;
          } else {
            vpc = "data.aws_vpc.default.id";
          }
        }
      }
      const cidr = p.cidrBlock || '10.0.1.0/24';
      const az = p.availabilityZone || 'us-east-1a';
      const mapPublic = p.mapPublicIp !== false;

      tfResourcesBlock += `resource "aws_subnet" "${name}" {
  vpc_id                  = ${vpc}
  cidr_block              = "${cidr}"
  availability_zone       = "${az}"
  map_public_ip_on_launch = ${mapPublic}
  tags = {
    Name = "${name}"
  }
}\n\n`;

      if (vpcNameForRt) {
        tfResourcesBlock += `resource "aws_route_table_association" "${name}_assoc" {
  subnet_id      = aws_subnet.${name}.id
  route_table_id = aws_route_table.${vpcNameForRt}_rt.id
}\n\n`;
      }
    }
    else if ((node.data as unknown as CanvasNodeData)?.isCustom && (node.data as unknown as CanvasNodeData)?.tech === 'Terraform') {
      const nodeData = node.data as unknown as CanvasNodeData;
      let customCode = nodeData.rawCode || '';
      const params: NodeParams = nodeData.parameters || {};
      Object.keys(params).forEach(key => {
        customCode = customCode.replace(new RegExp(`var\\.${key}`, 'g'), `"${params[key]}"`);
      });
      tfResourcesBlock += `# Custom Node: ${nodeData.label || id}\n${customCode}\n\n`;
    }
  });

  const mainTf = `# Generated by InfraFlow Visual Orchestration Platform
# Project: Project Alpha - Web-Server-Orchestration

${providerBlock}

${providers}

${subnetBlock}

${tfResourcesBlock}`;

  tfNodes.forEach(node => {
    const id = node.id;
    const p: NodeParams = (node.data as unknown as CanvasNodeData)?.parameters || {};
    if (id.startsWith('aws_s3_bucket') && hasAws) {
      const name = p.bucketName || 'whiparc-user-bucket';
      outputsTfContent += `output "${name}_bucket_arn" {
  value       = aws_s3_bucket.${name}.arn
  description = "ARN of the S3 bucket"
}\n\n`;
    }
    else if (id.startsWith('aws_db_instance') && hasAws) {
      const name = p.dbName || 'appdb';
      outputsTfContent += `output "${name}_endpoint" {
  value       = aws_db_instance.${name}.endpoint
  description = "Endpoint of the database instance"
}\n\n`;
    }
  });

  // Dynamic parameters HCL output resolver
  const getDynamicHclOutputExpr = (node: Node, outputKey: string, isGcp: boolean): string => {
    const p: NodeParams = (node.data as unknown as CanvasNodeData)?.parameters || {};
    const id = node.id;
    
    if (isGcp) {
      if (id.startsWith('aws_instance.web_server')) {
        if (outputKey === 'public_ip') return `google_compute_instance.vm_instance.network_interface.0.access_config.0.nat_ip`;
        if (outputKey === 'private_ip') return `google_compute_instance.vm_instance.network_interface.0.network_ip`;
        if (outputKey === 'id') return `google_compute_instance.vm_instance.instance_id`;
        if (outputKey === 'ssh_user') return `"ubuntu"`;
      }
      return '';
    }

    if (id.startsWith('aws_instance.web_server')) {
      const name = p.instanceName || 'web_server';
      if (outputKey === 'public_ip') return `aws_instance.${name}.public_ip`;
      if (outputKey === 'private_ip') return `aws_instance.${name}.private_ip`;
      if (outputKey === 'id') return `aws_instance.${name}.id`;
      if (outputKey === 'ssh_user') return `"ubuntu"`;
    }
    if (id.startsWith('aws_security_group')) {
      const name = p.sgName || 'web_sg';
      if (outputKey === 'sg_id') return `aws_security_group.${name}.id`;
      if (outputKey === 'sg_name') return `aws_security_group.${name}.name`;
    }
    if (id.startsWith('aws_s3_bucket')) {
      const name = p.bucketName || 'whiparc-user-bucket';
      if (outputKey === 'bucket_name') return `aws_s3_bucket.${name}.id`;
      if (outputKey === 'bucket_arn') return `aws_s3_bucket.${name}.arn`;
    }
    if (id.startsWith('aws_db_instance')) {
      const name = p.dbName || 'appdb';
      if (outputKey === 'endpoint') return `aws_db_instance.${name}.endpoint`;
      if (outputKey === 'port') return `aws_db_instance.${name}.port`;
      if (outputKey === 'db_name') return `aws_db_instance.${name}.db_name`;
      if (outputKey === 'username') return `aws_db_instance.${name}.username`;
    }
    if (id.startsWith('aws_vpc')) {
      const name = p.vpcName || 'app_vpc';
      if (outputKey === 'vpc_id') return `aws_vpc.${name}.id`;
      if (outputKey === 'cidr_block') return `aws_vpc.${name}.cidr_block`;
    }
    if (id.startsWith('aws_subnet')) {
      const name = p.subnetName || 'app_subnet';
      if (outputKey === 'subnet_id') return `aws_subnet.${name}.id`;
      if (outputKey === 'availability_zone') return `aws_subnet.${name}.availability_zone`;
    }
    return '';
  };

  // Scan all node parameters for dynamic variable references of format {{ nodes.node_name.output_key }}
  const dynamicOutputs: string[] = [];
  const regex = /{{\s*(?:nodes\.)?([a-zA-Z0-9_-]+)\.([a-zA-Z0-9_-]+)\s*}}/g;
  const serialized = JSON.stringify(nodes.map(n => n.data));
  const scanned = new Set<string>();
  let match;

  while ((match = regex.exec(serialized)) !== null) {
    const nodeVarName = match[1];
    const outputKey = match[2];
    
    const referencedNode = nodes.find(n => n.id.replace(/\./g, '_') === nodeVarName);
    if (referencedNode) {
      const uniqueKey = `${referencedNode.id}_${outputKey}`;
      if (!scanned.has(uniqueKey)) {
        scanned.add(uniqueKey);
        
        const expr = getDynamicHclOutputExpr(referencedNode, outputKey, hasGcp);
        if (expr) {
          dynamicOutputs.push(`output "${nodeVarName}_${outputKey}" {
  value       = ${expr}
  description = "Dynamic parameter output for ${nodeVarName}"
}`);
        }
      }
    }
  }

  if (dynamicOutputs.length > 0) {
    outputsTfContent += '\n\n' + dynamicOutputs.join('\n\n') + '\n';
  }

  return { mainTf, variablesTf, outputsTf: outputsTfContent };
}

export async function downloadTerraformZip(nodes: Node[], edges: Edge[] = []): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const { mainTf, variablesTf, outputsTf } = generateTerraformFiles(nodes, edges);
  const zip = new JSZip();
  zip.file('main.tf', mainTf);
  zip.file('variables.tf', variablesTf);
  zip.file('outputs.tf', outputsTf);
  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'terraform-config.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function generateBundleFiles(nodes: Node[], edges: Edge[]): FileItem[] {
  const hasTerraform = nodes.some(n => (n.data as unknown as CanvasNodeData)?.tech === 'Terraform');
  const hasAnsible = nodes.some(n => (n.data as unknown as CanvasNodeData)?.tech === 'Ansible' || (n.data as unknown as CanvasNodeData)?.tech === 'Source');
  const hasKubernetes = nodes.some(n => (n.data as unknown as CanvasNodeData)?.tech === 'Kubernetes');

  const countLines = (str: string) => str.split('\n').length;
  const getSizeKb = (str: string) => `${(str.length / 1024).toFixed(1)} KB`;

  const files: FileItem[] = [];

  if (hasTerraform) {
    const { mainTf, variablesTf, outputsTf } = generateTerraformFiles(nodes, edges);
    files.push(
      { path: 'terraform/main.tf', name: 'main.tf', language: 'HCL', icon: 'lucide:file', iconColor: 'text-primary', lines: countLines(mainTf), size: getSizeKb(mainTf), content: mainTf },
      { path: 'terraform/variables.tf', name: 'variables.tf', language: 'HCL', icon: 'lucide:file', iconColor: 'text-muted-foreground', lines: countLines(variablesTf), size: getSizeKb(variablesTf), content: variablesTf },
      { path: 'terraform/outputs.tf', name: 'outputs.tf', language: 'HCL', icon: 'lucide:file', iconColor: 'text-muted-foreground', lines: countLines(outputsTf), size: getSizeKb(outputsTf), content: outputsTf },
    );
  }

  if (hasAnsible) {
    const targetNode = nodes.find(n => (n.data as unknown as CanvasNodeData)?.tech === 'Target');
    const isGcp = targetNode?.id.startsWith('gcp_target');
    const playbookYml = generateAnsibleYAML(nodes, edges);
    const colon = ':';

    // Find starting Ansible node
    const ansibleNodes = nodes.filter(n => (n.data as unknown as CanvasNodeData)?.tech === 'Ansible' || (n.data as unknown as CanvasNodeData)?.tech === 'Source');
    const ansibleNodeIds = new Set(ansibleNodes.map(n => n.id));
    const nonStartAnsibleIds = new Set(
      edges.filter(e => ansibleNodeIds.has(e.target) && ansibleNodeIds.has(e.source)).map(e => e.target)
    );
    const startAnsibleNodes = ansibleNodes.filter(n => !nonStartAnsibleIds.has(n.id));
    const startNode = startAnsibleNodes[0];
    const startParams: NodeParams = (startNode?.data as unknown as CanvasNodeData)?.parameters || {};

    let hostLine = '';
    // Check if starting Ansible node has incoming VM connection
    const incomingVmEdges = edges.filter(
      e => e.target === startNode?.id &&
      (e.source.startsWith('aws_instance') || e.source.startsWith('google_compute_instance') || e.source.startsWith('gcp_target') || e.source.startsWith('azure_linux'))
    );

    const sshUser = startParams.ansibleUser || 'ubuntu';

    if (incomingVmEdges.length > 0) {
      const vmNode = nodes.find(n => n.id === incomingVmEdges[0].source);
      const vmParams: NodeParams = (vmNode?.data as unknown as CanvasNodeData)?.parameters || {};
      const vmName = vmParams.instanceName || 'web_server';
      if (vmNode?.id.startsWith('aws_instance')) {
        hostLine = `web_server_1 ansible_host=aws_instance.${vmName}.public_ip ansible_user=${sshUser}`;
      } else if (vmNode?.id.startsWith('google_compute_instance') || vmNode?.id.startsWith('gcp_target')) {
        hostLine = `web_server_1 ansible_host=google_compute_instance.${vmName}.public_ip ansible_user=${sshUser}`;
      } else {
        const azureUser = startParams.ansibleUser || 'azureuser';
        hostLine = `web_server_1 ansible_host=azurerm_public_ip.pip.ip_address ansible_user=${azureUser}`;
      }
    } else if (startParams.ansibleHost) {
      const hostVal = startParams.ansibleHost.trim();
      hostLine = `web_server_1 ansible_host=${hostVal} ansible_user=${sshUser}`;
    } else {
      // Fallback to first VM on canvas
      const fallbackVm = nodes.find(n => n.id.startsWith('aws_instance.web_server'));
      if (fallbackVm) {
        const vmParams: NodeParams = (fallbackVm.data as unknown as CanvasNodeData)?.parameters || {};
        const vmName = vmParams.instanceName || 'web_server';
        hostLine = `web_server_1 ansible_host=aws_instance.${vmName}.public_ip ansible_user=${sshUser}`;
      } else {
        const fallbackGcp = nodes.find(n => n.id.startsWith('gcp_target'));
        if (fallbackGcp) {
          hostLine = `web_server_1 ansible_host=google_compute_instance.web_server.public_ip ansible_user=${sshUser}`;
        } else {
          hostLine = `web_server_1 ansible_host=127.0.0.1 ansible_user=${sshUser}`;
        }
      }
    }

    const hostsIni = `[webservers]
${hostLine}

[all${colon}vars]
ansible_python_interpreter=/usr/bin/python3`;

    files.push(
      { path: 'ansible/playbook.yml', name: 'playbook.yml', language: 'YAML', icon: 'lucide:clipboard', iconColor: 'text-[#8B5CF6]', lines: countLines(playbookYml), size: getSizeKb(playbookYml), content: playbookYml },
      { path: 'ansible/hosts.ini', name: 'hosts.ini', language: 'INI', icon: 'lucide:settings', iconColor: 'text-muted-foreground', lines: countLines(hostsIni), size: getSizeKb(hostsIni), content: hostsIni },
    );
  }

  if (hasKubernetes) {
    const k8sManifests: string[] = [];
    const k8sNodes = nodes.filter(n => (n.data as unknown as CanvasNodeData)?.tech === 'Kubernetes');
    k8sNodes.forEach(node => {
      const id = node.id;
      const p: NodeParams = (node.data as unknown as CanvasNodeData)?.parameters || {};

      if (id.startsWith('k8s_deployment')) {
        const name = p.deploymentName || 'app-deploy';
        const replicas = p.replicas || 3;
        const image = p.imageName || 'nginx:1.21';
        const port = p.containerPort || 80;
        const cpu = p.cpuLimit || '500m';
        const memory = p.memoryLimit || '512Mi';

        k8sManifests.push(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  labels:
    app: ${name}
spec:
  replicas: ${replicas}
  selector:
    matchLabels:
      app: ${name}
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
      - name: container
        image: ${image}
        ports:
        - containerPort: ${port}
        resources:
          limits:
            cpu: "${cpu}"
            memory: "${memory}"`);
      }
      else if (id.startsWith('k8s_service')) {
        const name = p.serviceName || 'app-service';
        const type = p.serviceType || 'ClusterIP';
        const port = p.port || 80;
        const targetPort = p.targetPort || 80;

        k8sManifests.push(`apiVersion: v1
kind: Service
metadata:
  name: ${name}
spec:
  type: ${type}
  ports:
  - port: ${port}
    targetPort: ${targetPort}
  selector:
    app: app-deploy`);
      }
      else if (id.startsWith('k8s_configmap')) {
        const name = p.configMapName || 'app-config';
        const key = p.dataKey || 'APP_ENV';
        const val = p.dataValue || 'production';

        k8sManifests.push(`apiVersion: v1
kind: ConfigMap
metadata:
  name: ${name}
data:
  ${key}: "${val}"`);
      }
      else if (id.startsWith('k8s_secret')) {
        const name = p.secretName || 'app-secret';
        const key = p.secretKey || 'DB_PASSWORD';
        const val = p.secretValue || 'SecretString123';
        const base64Val = typeof window !== 'undefined' ? btoa(val) : Buffer.from(val).toString('base64');

        k8sManifests.push(`apiVersion: v1
kind: Secret
metadata:
  name: ${name}
type: Opaque
data:
  ${key}: "${base64Val}"`);
      }
      else if (id.startsWith('k8s_ingress')) {
        const name = p.ingressName || 'app-ingress';
        const host = p.host || 'app.local';
        const path = p.path || '/';
        const svcName = p.serviceName || 'app-service';
        const svcPort = p.servicePort || 80;

        k8sManifests.push(`apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ${name}
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: ${host}
    http:
      paths:
      - path: ${path}
        pathType: Prefix
        backend:
          service:
            name: ${svcName}
            port:
              number: ${svcPort}`);
      }
      else if (id.startsWith('k8s_pvc')) {
        const name = p.pvcName || 'app-pvc';
        const size = p.storageSize || '10Gi';
        const storageClass = p.storageClass || 'standard';

        k8sManifests.push(`apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: ${name}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: ${size}
  storageClassName: ${storageClass}`);
      }
      else if ((node.data as unknown as CanvasNodeData)?.isCustom && (node.data as unknown as CanvasNodeData)?.tech === 'Kubernetes') {
        const nodeData = node.data as unknown as CanvasNodeData;
        let customYaml = nodeData.rawCode || '';
        const params: NodeParams = nodeData.parameters || {};

        Object.entries(params).forEach(([key, val]) => {
          const re = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
          customYaml = customYaml.replace(re, `${val}`);
        });
        k8sManifests.push(customYaml);
      }
    });

    if (k8sManifests.length === 0) {
      k8sManifests.push(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-server-deployment
  labels:
    app: web-server
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-server
  template:
    metadata:
      labels:
        app: web-server
    spec:
      containers:
      - name: nginx
        image: nginx:1.21
        ports:
        - containerPort: 80`);
    }

    const deploymentYamlContent = k8sManifests.join('\n---\n');
    files.push(
      { path: 'k8s/deployment.yaml', name: 'deployment.yaml', language: 'YAML', icon: 'lucide:layers', iconColor: 'text-[#0EA5E9]', lines: countLines(deploymentYamlContent), size: getSizeKb(deploymentYamlContent), content: deploymentYamlContent },
    );
  }

  const techList = [hasTerraform && 'Terraform', hasAnsible && 'Ansible', hasKubernetes && 'Kubernetes'].filter(Boolean).join(', ');
  const readmeContent = `# InfraFlow Generated Bundle

This bundle contains the generated infrastructure code for **Project Alpha - Web-Server-Orchestration**.

## Technologies
${techList || 'No technologies configured on canvas yet.'}

## Usage
${hasTerraform ? '1. Initialize and apply Terraform: `cd terraform && terraform init && terraform apply`\n' : ''}${hasAnsible ? '2. Run Ansible playbook: `cd ansible && ansible-playbook -i hosts.ini playbook.yml`\n' : ''}${hasKubernetes ? '3. Apply Kubernetes manifests: `kubectl apply -f k8s/`\n' : ''}`;

  files.push(
    { path: 'README.md', name: 'README.md', language: 'Markdown', icon: 'lucide:file', iconColor: 'text-muted-foreground', lines: countLines(readmeContent), size: getSizeKb(readmeContent), content: readmeContent },
  );

  return files;
}

export async function downloadZipBundle(nodes: Node[], edges: Edge[]): Promise<void> {
  const JSZip = (await import('jszip')).default;
  const files = generateBundleFiles(nodes, edges);
  const zip = new JSZip();

  files.forEach((file) => {
    zip.file(file.path, file.content);
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'infraflow-bundle.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
