import { create } from 'zustand';
import {
    Connection,
    Edge,
    EdgeChange,
    Node,
    NodeChange,
    addEdge,
    applyNodeChanges,
    applyEdgeChanges,
} from '@xyflow/react';

export type NodeExecutionStatus = 'idle' | 'pending' | 'running' | 'completed' | 'failed';

// A custom automation block created via CustomNodeModal and persisted through
// the /api/projects/:id/custom-nodes endpoint. Kept separate from the
// canvas's react-flow `Node` type since these are library templates, not
// placed nodes — see LibraryNode in app/workspace/page.tsx for the shape
// these get mapped into before rendering in the node palette.
export interface CustomLibraryNode {
    id: string;
    project_id?: string;
    title: string;
    tech: 'Terraform' | 'Ansible' | 'Kubernetes';
    category: string;
    description: string;
    code_type: 'tf' | 'yml';
    raw_code: string;
    parsed_meta_json: string;
}

// Define the shape of your state
type CanvasState = {
    nodes: Node[];
    edges: Edge[];
    selectedNodeId: string | null;
    selectedEdgeId: string | null;
    onNodesChange: (changes: NodeChange[]) => void;
    onEdgesChange: (changes: EdgeChange[]) => void;
    onConnect: (connection: Connection) => void;
    setNodes: (nodes: Node[]) => void;
    setEdges: (edges: Edge[]) => void;
    addNode: (node: Node) => void;
    deleteNode: (nodeId: string) => void;
    setSelectedNodeId: (id: string | null) => void;
    setSelectedEdgeId: (id: string | null) => void;
    updateNodeData: (nodeId: string, newData: Record<string, unknown>) => void;
    updateEdgeData: (edgeId: string, label: string, animated: boolean, stroke: string, strokeWidth: number) => void;
    deleteEdge: (edgeId: string) => void;
    resetCanvas: () => void;
    isExecuting: boolean;
    setIsExecuting: (executing: boolean) => void;
    activeTool: 'select' | 'pan' | 'link';
    setActiveTool: (tool: 'select' | 'pan' | 'link') => void;
    executionStatuses: Record<string, NodeExecutionStatus>;
    setNodeExecutionStatus: (nodeId: string, status: NodeExecutionStatus) => void;
    resetExecutionStatuses: () => void;
    pipelineAction: 'deploy' | 'destroy' | null;
    setPipelineAction: (action: 'deploy' | 'destroy' | null) => void;
    projectId: string | null;
    setProjectId: (id: string | null) => void;
    saveStatus: 'saved' | 'saving' | 'error' | 'readonly';
    setSaveStatus: (status: 'saved' | 'saving' | 'error' | 'readonly') => void;
    version: number;
    setVersion: (version: number) => void;
    customLibraryNodes: CustomLibraryNode[];
    setCustomLibraryNodes: (nodes: CustomLibraryNode[]) => void;
    addCustomLibraryNode: (node: CustomLibraryNode) => void;
    deleteCustomLibraryNode: (nodeId: string) => void;
};

// Initial nodes reflecting the 4 pre-populated nodes from design-idea
export const getInitialNodes = (): Node[] => [
  {
    id: 'aws_security_group.web_sg',
    type: 'customNode',
    position: { x: 160, y: 96 },
    data: {
      label: 'aws_security_group.web_sg',
      tech: 'Terraform',
      icon: 'lucide:shield',
      categoryLabel: 'AWS SG',
      description: 'Allows HTTP/HTTPS inbound & SSH access.',
      status: 'Validated',
      statusText: 'Validated'
    }
  },
  {
    id: 'aws_instance.web_server',
    type: 'customNode',
    position: { x: 380, y: 48 },
    data: {
      label: 'aws_instance.web_server',
      tech: 'Terraform',
      icon: 'lucide:globe',
      categoryLabel: 'AWS EC2',
      description: 't3.medium instance running Ubuntu 22.04.',
      status: 'Validated',
      statusText: 'Validated',
      parameters: {
        instanceName: 'web_server',
        amiId: 'ami-785db401', // LocalStack's mocked EC2 only recognizes its own seeded AMIs
        instanceType: 't3.medium',
        subnetId: 'subnet-0123456789abcdef0',
        rootVolumeSize: 50,
        tags: [
          { key: 'Environment', value: 'prod' },
          { key: 'Role', value: 'web' }
        ]
      }
    }
  },
  {
    id: 'install_nginx.yml',
    type: 'customNode',
    position: { x: 700, y: 192 },
    data: {
      label: 'Install Nginx',
      tech: 'Ansible',
      icon: 'lucide:zap',
      categoryLabel: 'Ansible Playbook',
      description: 'Installs, configures, and starts latest Nginx.',
      status: 'Editing',
      statusText: 'Editing',
      editorName: 'Sarah'
    }
  },
  {
    id: 'deploy_site_assets',
    type: 'customNode',
    position: { x: 1020, y: 288 },
    data: {
      label: 'Copy .env File',
      tech: 'Ansible',
      icon: 'lucide:copy',
      categoryLabel: 'Ansible Task',
      description: 'Source path needs authentication keys.',
      status: 'Warning',
      statusText: 'Warning'
    }
  }
];

// Initial edges matching the design-idea connection layouts and styling
export const getInitialEdges = (): Edge[] => [
  {
    id: 'e_sg_instance',
    source: 'aws_security_group.web_sg',
    target: 'aws_instance.web_server',
    style: { stroke: '#6366F1', strokeWidth: 2.5 },
    animated: false
  },
  {
    id: 'e_instance_nginx',
    source: 'aws_instance.web_server',
    target: 'install_nginx.yml',
    style: { stroke: 'url(#grad-tf-ansible)', strokeWidth: 2.5 },
    className: 'animate-dash-flow',
    animated: true
  },
  {
    id: 'e_nginx_assets',
    source: 'install_nginx.yml',
    target: 'deploy_site_assets',
    style: { stroke: '#8B5CF6', strokeWidth: 2.5 },
    animated: false
  }
];

// Create the Zustand store
const useCanvasStore = create<CanvasState>((set, get) => ({
    nodes: [],
    edges: [],
    selectedNodeId: null,
    selectedEdgeId: null,
    isExecuting: false,
    activeTool: 'select',
    executionStatuses: {},
    pipelineAction: null,
    projectId: null,
    saveStatus: 'saved',
    version: 1,

    setIsExecuting: (executing) => set({ isExecuting: executing }),
    setActiveTool: (tool) => set({ activeTool: tool }),
    setNodeExecutionStatus: (nodeId, status) => set((state) => ({
        executionStatuses: { ...state.executionStatuses, [nodeId]: status }
    })),
    resetExecutionStatuses: () => set({ executionStatuses: {} }),
    setPipelineAction: (action) => set({ pipelineAction: action }),
    setProjectId: (projectId) => set({ projectId }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setVersion: (version) => set({ version }),

    setSelectedNodeId: (id) => set({ selectedNodeId: id }),
    setSelectedEdgeId: (id) => set({ selectedEdgeId: id }),
    
    updateNodeData: (nodeId, newData) => {
        set((state) => ({
            nodes: state.nodes.map((node) => {
                if (node.id === nodeId) {
                    return { 
                        ...node,
                        data: {
                            ...node.data,
                            ...newData
                        }
                    };
                }
                return node;
            }),
        }));
    },

    updateEdgeData: (edgeId: string, label: string, animated: boolean, stroke: string, strokeWidth: number) => {
        set((state) => ({
            edges: state.edges.map((edge) => {
                if (edge.id === edgeId) {
                    return {
                        ...edge,
                        label: label || undefined,
                        animated,
                        className: animated ? 'animate-dash-flow' : '',
                        style: {
                            ...edge.style,
                            stroke,
                            strokeWidth
                        }
                    };
                }
                return edge;
            })
        }));
    },

    deleteEdge: (edgeId: string) => {
        if (get().isExecuting) return;
        set((state) => ({
            edges: state.edges.filter((edge) => edge.id !== edgeId),
            selectedEdgeId: state.selectedEdgeId === edgeId ? null : state.selectedEdgeId
        }));
    },

    addNode: (node) => {
        if (get().isExecuting) return;
        set({ nodes: [...get().nodes, node] });
    },

    deleteNode: (nodeId) => {
        if (get().isExecuting) return;
        set((state) => ({
            nodes: state.nodes.filter((node) => node.id !== nodeId),
            edges: state.edges.filter((edge) => edge.source !== nodeId && edge.target !== nodeId),
            selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId
        }));
    },

    // Handlers for React Flow
    onNodesChange: (changes: NodeChange[]) => {
        set({
            nodes: applyNodeChanges(changes, get().nodes),
        });
    },
    onEdgesChange: (changes: EdgeChange[]) => {
        const nextEdges = applyEdgeChanges(changes, get().edges);
        const removed = changes.some(c => c.type === 'remove');
        if (removed && get().selectedEdgeId && !nextEdges.some(e => e.id === get().selectedEdgeId)) {
            set({ selectedEdgeId: null });
        }
        set({
            edges: nextEdges,
        });
    },
    
    onConnect: (connection: Connection) => {
        // Resolve technology of source and target to determine edge styles
        const sourceNode = get().nodes.find(n => n.id === connection.source);
        const targetNode = get().nodes.find(n => n.id === connection.target);
        
        let stroke = '#8B5CF6'; // Default Ansible color
        let className = '';
        let animated = false;

        if (sourceNode && targetNode) {
          const sourceTech = sourceNode.data.tech;
          const targetTech = targetNode.data.tech;

          if (sourceTech === 'Source') {
            stroke = '#F59E0B';
          } else if (sourceTech === 'Target') {
            stroke = '#14B8A6';
          } else if (sourceTech === 'Terraform' && targetTech === 'Terraform') {
            stroke = '#6366F1';
          } else if (sourceTech === 'Terraform' && targetTech === 'Ansible') {
            stroke = 'url(#grad-tf-ansible)';
            className = 'animate-dash-flow';
            animated = true;
          } else if (sourceTech === 'Ansible' && targetTech === 'Kubernetes') {
            stroke = 'url(#grad-ansible-k8s)';
          } else if (sourceTech === 'Kubernetes' && targetTech === 'Kubernetes') {
            stroke = '#0EA5E9';
          }
        }

        const newEdge: Edge = {
          id: `reactflow__edge-${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
          style: { stroke, strokeWidth: 2.5 },
          className,
          animated
        };

        set({
            edges: addEdge(newEdge, get().edges),
        });
    },

    setNodes: (nodes: Node[]) => set({ nodes }),
    setEdges: (edges: Edge[]) => set({ edges }),
    
    resetCanvas: () => {
      set({
        nodes: [],
        edges: [],
        selectedNodeId: null,
        activeTool: 'select'
      });
    },

    customLibraryNodes: [],
    setCustomLibraryNodes: (nodes) => set({ customLibraryNodes: nodes }),
    addCustomLibraryNode: (node) => set({ customLibraryNodes: [node, ...get().customLibraryNodes] }),
    deleteCustomLibraryNode: (nodeId: string) => set({ customLibraryNodes: get().customLibraryNodes.filter(n => n.id !== nodeId) }),
}));

export default useCanvasStore;