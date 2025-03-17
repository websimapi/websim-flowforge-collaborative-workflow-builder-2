import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MiniMap,
} from 'react-flow-renderer';

// Initialize WebsimSocket for multiplayer
const room = new WebsimSocket();

const nodeTypes = {
  trigger: 'Trigger',
  action: 'Action',
  logic: 'Logic',
  output: 'Output',
  code: 'Code',
};

const nodeIcons = {
  trigger: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
  ),
  action: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
    </svg>
  ),
  logic: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
    </svg>
  ),
  output: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
    </svg>
  ),
  code: (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"></polyline>
      <polyline points="8 6 2 12 8 18"></polyline>
    </svg>
  ),
};

const CustomNode = ({ data, selected }) => {
  return (
    <div className={`node ${selected ? 'selected' : ''}`}>
      <div className="node-header">
        {nodeIcons[data.type]}
        <div className="node-title">{data.label}</div>
        <div className="node-badge">{nodeTypes[data.type]}</div>
      </div>
      <div className="node-content">
        {data.description || 'Configure this node...'}
      </div>
    </div>
  );
};

const initialNodes = [];
const initialEdges = [];

const FlowForge = () => {
  const reactFlowWrapper = useRef(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [workflows, setWorkflows] = useState([]);
  const [activeWorkflow, setActiveWorkflow] = useState(null);
  const [showNewWorkflowModal, setShowNewWorkflowModal] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [newWorkflowDescription, setNewWorkflowDescription] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showForkModal, setShowForkModal] = useState(false);
  const [forkName, setForkName] = useState('');
  const [forkDescription, setForkDescription] = useState('');
  
  // Load all workflows when component mounts
  useEffect(() => {
    const workflowList = room.collection('workflow').getList();
    setWorkflows(workflowList || []);
    
    // Subscribe to changes in workflows
    const unsubscribe = room.collection('workflow').subscribe((updatedWorkflows) => {
      setWorkflows(updatedWorkflows || []);
    });
    
    return () => unsubscribe();
  }, []);
  
  // Load workflow data when active workflow changes
  useEffect(() => {
    if (!activeWorkflow) {
      setNodes([]);
      setEdges([]);
      return;
    }
    
    // Load nodes and edges for active workflow
    const workflowNodes = room.collection('node')
      .filter({ workflowId: activeWorkflow.id })
      .getList();
    
    const workflowEdges = room.collection('edge')
      .filter({ workflowId: activeWorkflow.id })
      .getList();
    
    setNodes(workflowNodes.map(node => ({
      ...node,
      position: { x: node.positionX, y: node.positionY },
      type: 'custom',
      data: { 
        label: node.label, 
        type: node.nodeType,
        description: node.description,
        config: node.config
      }
    })));
    
    setEdges(workflowEdges.map(edge => ({
      ...edge,
      source: edge.sourceId,
      target: edge.targetId,
    })));
    
    // Subscribe to changes in nodes and edges
    const unsubscribeNodes = room.collection('node')
      .filter({ workflowId: activeWorkflow.id })
      .subscribe((updatedNodes) => {
        setNodes(updatedNodes.map(node => ({
          ...node,
          position: { x: node.positionX, y: node.positionY },
          type: 'custom',
          data: { 
            label: node.label, 
            type: node.nodeType,
            description: node.description,
            config: node.config
          }
        })));
      });
    
    const unsubscribeEdges = room.collection('edge')
      .filter({ workflowId: activeWorkflow.id })
      .subscribe((updatedEdges) => {
        setEdges(updatedEdges.map(edge => ({
          ...edge,
          source: edge.sourceId,
          target: edge.targetId,
        })));
      });
    
    return () => {
      unsubscribeNodes();
      unsubscribeEdges();
    };
  }, [activeWorkflow]);
  
  const onConnect = useCallback(async (params) => {
    if (!activeWorkflow) return;
    
    await room.collection('edge').create({
      workflowId: activeWorkflow.id,
      sourceId: params.source,
      targetId: params.target,
    });
  }, [activeWorkflow]);
  
  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  const onDrop = useCallback(async (event) => {
    event.preventDefault();
    
    if (!activeWorkflow) return;
    
    const type = event.dataTransfer.getData('application/reactflow/type');
    const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
    const position = reactFlowInstance.project({
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    });
    
    const newNode = {
      workflowId: activeWorkflow.id,
      label: `New ${nodeTypes[type]}`,
      nodeType: type,
      positionX: position.x,
      positionY: position.y,
      description: '',
      config: {}
    };
    
    await room.collection('node').create(newNode);
  }, [reactFlowInstance, activeWorkflow]);
  
  const onNodeDragStart = () => {
    setIsDragging(true);
  };
  
  const onNodeDragStop = async (event, node) => {
    setIsDragging(false);
    
    if (!activeWorkflow) return;
    
    await room.collection('node').update(node.id, {
      positionX: node.position.x,
      positionY: node.position.y
    });
  };
  
  const onNodeClick = (event, node) => {
    setSelectedNode(node);
  };
  
  const onPaneClick = () => {
    setSelectedNode(null);
  };
  
  const createNewWorkflow = async () => {
    if (!newWorkflowName.trim()) return;
    
    const newWorkflow = await room.collection('workflow').create({
      name: newWorkflowName,
      description: newWorkflowDescription,
      isForked: false,
      forkedFrom: null,
      version: 1
    });
    
    setActiveWorkflow(newWorkflow);
    setShowNewWorkflowModal(false);
    setNewWorkflowName('');
    setNewWorkflowDescription('');
  };
  
  const forkWorkflow = async () => {
    if (!forkName.trim() || !activeWorkflow) return;
    
    // Create a forked workflow
    const forkedWorkflow = await room.collection('workflow').create({
      name: forkName,
      description: forkDescription,
      isForked: true,
      forkedFrom: activeWorkflow.id,
      originalCreator: activeWorkflow.username,
      version: 1
    });
    
    // Clone all nodes
    const nodesToFork = room.collection('node')
      .filter({ workflowId: activeWorkflow.id })
      .getList();
    
    const nodeIdMap = {};
    
    for (const node of nodesToFork) {
      const forkedNode = await room.collection('node').create({
        workflowId: forkedWorkflow.id,
        label: node.label,
        nodeType: node.nodeType,
        positionX: node.positionX,
        positionY: node.positionY,
        description: node.description,
        config: node.config
      });
      
      nodeIdMap[node.id] = forkedNode.id;
    }
    
    // Clone all edges
    const edgesToFork = room.collection('edge')
      .filter({ workflowId: activeWorkflow.id })
      .getList();
    
    for (const edge of edgesToFork) {
      await room.collection('edge').create({
        workflowId: forkedWorkflow.id,
        sourceId: nodeIdMap[edge.sourceId],
        targetId: nodeIdMap[edge.targetId]
      });
    }
    
    setActiveWorkflow(forkedWorkflow);
    setShowForkModal(false);
    setForkName('');
    setForkDescription('');
  };
  
  const updateNodeProperties = async (properties) => {
    if (!selectedNode || !activeWorkflow) return;
    
    await room.collection('node').update(selectedNode.id, {
      label: properties.label,
      description: properties.description,
      config: properties.config
    });
  };
  
  const onDragStart = (event, nodeType) => {
    event.dataTransfer.setData('application/reactflow/type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };
  
  // Track and share cursor position
  useEffect(() => {
    const trackMousePosition = (event) => {
      if (reactFlowWrapper.current) {
        const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
        const position = {
          x: event.clientX - reactFlowBounds.left,
          y: event.clientY - reactFlowBounds.top,
        };
        
        room.party.updatePresence({
          cursorX: position.x,
          cursorY: position.y,
        });
      }
    };
    
    window.addEventListener('mousemove', trackMousePosition);
    
    return () => {
      window.removeEventListener('mousemove', trackMousePosition);
    };
  }, []);
  
  // Get data for active workflow forks
  const getWorkflowForks = () => {
    if (!activeWorkflow) return [];
    
    return workflows.filter(workflow => 
      workflow.isForked && workflow.forkedFrom === activeWorkflow.id
    );
  };
  
  // Get parent workflow for a fork
  const getParentWorkflow = () => {
    if (!activeWorkflow || !activeWorkflow.isForked) return null;
    
    return workflows.find(workflow => workflow.id === activeWorkflow.forkedFrom);
  };
  
  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"></path>
            <path d="M12 2h3.5a3.5 3.5 0 0 1 0 7H12V2z"></path>
            <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"></path>
            <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"></path>
            <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"></path>
          </svg>
          FlowForge
        </div>
        <div className="toolbar">
          {activeWorkflow && (
            <>
              <div className="active-workflow-title">{activeWorkflow.name}</div>
              <button className="btn btn-outline" onClick={() => setShowForkModal(true)}>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="18" r="3"></circle>
                  <circle cx="6" cy="6" r="3"></circle>
                  <circle cx="18" cy="6" r="3"></circle>
                  <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
                  <path d="M12 12v3"></path>
                </svg>
                Fork
              </button>
              <div className="user-list">
                {Object.values(room.party.peers).map((peer) => (
                  <div key={peer.id} className="user-avatar" style={{ backgroundColor: stringToColor(peer.username) }}>
                    {peer.username.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
            </>
          )}
          <button className="btn btn-primary" onClick={() => setShowNewWorkflowModal(true)}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            New Workflow
          </button>
        </div>
      </header>
      
      <div className="main-container">
        <div className="sidebar">
          <div className="sidebar-section">
            <h3>Nodes</h3>
            <div className="node-palette">
              {Object.entries(nodeTypes).map(([type, label]) => (
                <div 
                  key={type} 
                  className="node-item"
                  draggable
                  onDragStart={(event) => onDragStart(event, type)}
                >
                  {nodeIcons[type]}
                  {label}
                </div>
              ))}
            </div>
          </div>
          
          <div className="sidebar-section sidebar-workflows">
            <h3>Workflows</h3>
            <div className="workflow-list">
              {workflows.map(workflow => (
                <div 
                  key={workflow.id} 
                  className={`workflow-item ${activeWorkflow?.id === workflow.id ? 'active' : ''}`}
                  onClick={() => setActiveWorkflow(workflow)}
                >
                  <div className="workflow-info">
                    <div className="workflow-title">{workflow.name}</div>
                    <div className="workflow-meta">
                      By {workflow.username} • v{workflow.version}
                      {workflow.isForked && ` • Forked from ${workflow.originalCreator}`}
                    </div>
                  </div>
                </div>
              ))}
              {workflows.length === 0 && (
                <div className="empty-workflow">No workflows yet. Create one!</div>
              )}
            </div>
          </div>
        </div>
        
        <div className="editor-container" ref={reactFlowWrapper}>
          {activeWorkflow ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDrop}
              onDragOver={onDragOver}
              onNodeDragStart={onNodeDragStart}
              onNodeDragStop={onNodeDragStop}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={{ custom: CustomNode }}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
              
              {/* Render collaborator cursors */}
              {Object.entries(room.party.presence || {}).map(([clientId, presence]) => {
                // Don't render your own cursor
                if (clientId === room.party.client.id) return null;
                if (!presence || !presence.cursorX || !presence.cursorY) return null;
                
                const color = stringToColor(room.party.peers[clientId]?.username || '');
                
                return (
                  <div 
                    key={clientId}
                    className="collaborator-cursor"
                    data-username={room.party.peers[clientId]?.username}
                    style={{
                      left: presence.cursorX,
                      top: presence.cursorY,
                      backgroundColor: color
                    }}
                  />
                );
              })}
              
              {activeWorkflow && activeWorkflow.isForked && (
                <div className="fork-ribbon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="18" r="3"></circle>
                    <circle cx="6" cy="6" r="3"></circle>
                    <circle cx="18" cy="6" r="3"></circle>
                    <path d="M18 9v1a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V9"></path>
                    <path d="M12 12v3"></path>
                  </svg>
                  Forked from {activeWorkflow.originalCreator}
                </div>
              )}
            </ReactFlow>
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5.5A3.5 3.5 0 0 1 8.5 2H12v7H8.5A3.5 3.5 0 0 1 5 5.5z"></path>
                  <path d="M12 2h3.5a3.5 3.5 0 0 1 0 7H12V2z"></path>
                  <path d="M12 12.5a3.5 3.5 0 1 1 7 0 3.5 3.5 0 1 1-7 0z"></path>
                  <path d="M5 19.5A3.5 3.5 0 0 1 8.5 16H12v3.5a3.5 3.5 0 1 1-7 0z"></path>
                  <path d="M5 12.5A3.5 3.5 0 0 1 8.5 9H12v7H8.5A3.5 3.5 0 0 1 5 12.5z"></path>
                </svg>
              </div>
              <h2 className="empty-state-title">Welcome to FlowForge</h2>
              <p className="empty-state-text">
                Create or select a workflow to start building your automation flow.
                Drag and drop nodes, connect them together, and collaborate in real-time.
              </p>
              <button className="btn btn-primary" onClick={() => setShowNewWorkflowModal(true)}>
                Create New Workflow
              </button>
            </div>
          )}
        </div>
        
        {selectedNode && (
          <div className="node-properties">
            <div className="panel-header">
              <div className="panel-title">Node Properties</div>
              <button 
                className="panel-close"
                onClick={() => setSelectedNode(null)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="panel-content">
              <NodeProperties 
                node={selectedNode} 
                updateNode={updateNodeProperties} 
              />
            </div>
          </div>
        )}
      </div>
      
      {/* New Workflow Modal */}
      {showNewWorkflowModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Create New Workflow</h3>
              <button 
                className="modal-close"
                onClick={() => setShowNewWorkflowModal(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Workflow Name</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="My Awesome Workflow"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea 
                  className="form-control"
                  value={newWorkflowDescription}
                  onChange={(e) => setNewWorkflowDescription(e.target.value)}
                  placeholder="What does this workflow do?"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-outline"
                onClick={() => setShowNewWorkflowModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={createNewWorkflow}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Fork Workflow Modal */}
      {showForkModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3 className="modal-title">Fork Workflow</h3>
              <button 
                className="modal-close"
                onClick={() => setShowForkModal(false)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Fork Name</label>
                <input 
                  type="text" 
                  className="form-control"
                  value={forkName}
                  onChange={(e) => setForkName(e.target.value)}
                  placeholder={`${activeWorkflow?.name} (your fork)`}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea 
                  className="form-control"
                  value={forkDescription}
                  onChange={(e) => setForkDescription(e.target.value)}
                  placeholder="What improvements or changes are you making?"
                  rows={3}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="btn btn-outline"
                onClick={() => setShowForkModal(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary"
                onClick={forkWorkflow}
              >
                Fork Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const NodeProperties = ({ node, updateNode }) => {
  const [label, setLabel] = useState(node.data.label);
  const [description, setDescription] = useState(node.data.description || '');
  const [config, setConfig] = useState(JSON.stringify(node.data.config || {}, null, 2));
  
  useEffect(() => {
    setLabel(node.data.label);
    setDescription(node.data.description || '');
    setConfig(JSON.stringify(node.data.config || {}, null, 2));
  }, [node]);
  
  const handleSave = () => {
    let parsedConfig = {};
    try {
      parsedConfig = JSON.parse(config);
    } catch (err) {
      alert('Invalid JSON for config');
      return;
    }
    
    updateNode({
      label,
      description,
      config: parsedConfig
    });
  };
  
  return (
    <div>
      <div className="form-group">
        <label className="form-label">Node Name</label>
        <input 
          type="text" 
          className="form-control"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea 
          className="form-control"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />
      </div>
      <div className="form-group">
        <label className="form-label">Node Configuration</label>
        <textarea 
          className="form-control code-editor"
          value={config}
          onChange={(e) => setConfig(e.target.value)}
          rows={10}
        />
        <div className="form-help">JSON format</div>
      </div>
      <button 
        className="btn btn-primary"
        onClick={handleSave}
      >
        Save Changes
      </button>
    </div>
  );
};

// Utility function to generate a color from a string
function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  
  return color;
}

const root = ReactDOM.createRoot(document.getElementById('app'));
root.render(<FlowForge />);