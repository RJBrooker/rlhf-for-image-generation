import React, { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:8000/api';
const ASSET_BASE = 'http://localhost:8000/images';

function App() {
  const [activeTab, setActiveTab] = useState('intro');
  const [stats, setStats] = useState({ total_images: 0, rated_count: 0, total_batches: 0, percent_rated: 0 });
  const [globalStatus, setGlobalStatus] = useState({ is_generating: false, is_training: false });
  const [projectState, setProjectState] = useState({ active: 'Default', projects: ['Default'] });
  const [newProjectName, setNewProjectName] = useState('');
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'theme-light');

  useEffect(() => {
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycleTheme = () => {
    setTheme(prev => {
      if (prev === 'theme-light') return 'theme-dark';
      if (prev === 'theme-dark') return 'theme-midnight';
      return 'theme-light';
    });
  };

  const fetchProjects = async () => {
    const res = await fetch(`${API_BASE}/projects`);
    if (res.ok) setProjectState(await res.json());
  };

  const switchProject = async (name) => {
    if (name === projectState.active) return;
    await fetch(`${API_BASE}/projects/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: name })
    });
    window.location.reload();
  };

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    await fetch(`${API_BASE}/projects/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: newProjectName })
    });
    setNewProjectName('');
    setIsCreatingProject(false);
    await switchProject(newProjectName);
  };

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/stats`, { cache: 'no-store' });
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch stats", err);
    }
  };

  const fetchGlobalStatus = async () => {
    try {
      const [genRes, modRes] = await Promise.all([
        fetch(`${API_BASE}/generate/status`, { cache: 'no-store' }),
        fetch(`${API_BASE}/models/status`, { cache: 'no-store' })
      ]);
      if (genRes.ok && modRes.ok) {
        setGlobalStatus({
          is_generating: (await genRes.json()).is_generating,
          is_training: (await modRes.json()).is_training
        });
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchStats();
    fetchProjects();
    fetchGlobalStatus();
    const interval = setInterval(fetchStats, 5000);
    const statusInterval = setInterval(fetchGlobalStatus, 3000);
    return () => {
      clearInterval(interval);
      clearInterval(statusInterval);
    };
  }, []);

  return (
    <div className={`flex h-screen bg-white text-neutral-900 font-sans tracking-tight ${theme}`}>
      {/* Sidebar */}
      <aside className="w-64 border-r border-neutral-200 flex flex-col bg-white">
        <div className="p-8 pb-4 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold tracking-tighter uppercase leading-tight">Generative RLHF</h1>
            <p className="text-neutral-500 text-[10px] mt-2 uppercase tracking-widest">Reinforcement Learning<br/>from Human Feedback</p>
          </div>
          <button 
            onClick={cycleTheme}
            className="w-8 h-8 flex items-center justify-center border border-neutral-200 hover:border-black rounded-full transition-colors cursor-pointer"
            title="Toggle Theme"
          >
            {theme === 'theme-light' ? '☀️' : theme === 'theme-dark' ? '🌙' : '💻'}
          </button>
        </div>

        <div className="px-8 pb-6 border-b border-neutral-100">
          <div className="flex justify-between items-center mb-2">
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Active Project</div>
            <button 
              onClick={() => setShowProjectModal(true)}
              className="text-neutral-400 hover:text-black transition-colors cursor-pointer"
              title="Manage Projects"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          {isCreatingProject ? (
            <div className="flex flex-col gap-2">
              <input 
                type="text" 
                value={newProjectName} 
                onChange={e => setNewProjectName(e.target.value)} 
                placeholder="Project Name..."
                className="text-xs p-2 border border-black outline-none font-semibold w-full"
                autoFocus
              />
              <div className="flex gap-2">
                <button onClick={createProject} className="text-[10px] uppercase font-bold bg-black text-white px-3 py-1.5 flex-1">Create</button>
                <button onClick={() => setIsCreatingProject(false)} className="text-[10px] uppercase font-bold border border-neutral-200 px-3 py-1.5">Cancel</button>
              </div>
            </div>
          ) : (
            <select 
              value={projectState.active}
              onChange={(e) => {
                if (e.target.value === '___NEW___') setIsCreatingProject(true);
                else switchProject(e.target.value);
              }}
              className="w-full text-sm font-semibold tracking-tight p-2 border-b-2 border-black outline-none bg-transparent cursor-pointer appearance-none rounded-none"
            >
              {projectState.projects.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              <option value="___NEW___" className="text-neutral-400">+ Create New Project</option>
            </select>
          )}
        </div>

        <nav className="flex-1 px-6 space-y-4 mt-6">
          <TabButton id="intro" label="Introduction" active={activeTab} set={setActiveTab} />
          <TabButton id="inputs" label="1. Data Config" active={activeTab} set={setActiveTab} />
          <TabButton id="generation" label="2. Generation" active={activeTab} set={setActiveTab} />
          <TabButton id="evaluation" label="3. Evaluation" active={activeTab} set={setActiveTab} />
          <TabButton id="models" label="4. Models" active={activeTab} set={setActiveTab} />
          <TabButton id="gallery" label="5. Gallery" active={activeTab} set={setActiveTab} />
          <TabButton id="logs" label="6. System Logs" active={activeTab} set={setActiveTab} />
        </nav>

        <div className="p-8 border-t border-neutral-100">
          <h3 className="text-xs font-bold text-neutral-400 uppercase tracking-widest mb-4">Overview</h3>
          <div className="space-y-4">
            <StatRow label="Batches" value={stats.total_batches} />
            <StatRow label="Images" value={stats.total_images} />
            <StatRow label="Rated" value={`${stats.rated_count} (${Math.round(stats.percent_rated || 0)}%)`} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-auto bg-white relative">
        <div className="absolute top-8 right-8 z-50 flex items-center gap-3 bg-neutral-50 border border-neutral-200 px-4 py-2 shadow-sm rounded-full pointer-events-none">
          {globalStatus.is_generating || globalStatus.is_training ? (
            <>
              <svg className="animate-spin h-3.5 w-3.5 text-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="text-[10px] font-bold uppercase tracking-widest text-black">
                {globalStatus.is_generating && globalStatus.is_training 
                  ? "Generating & Training..." 
                  : globalStatus.is_generating 
                    ? "Generating Images..." 
                    : "Training Models..."}
              </span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-neutral-300"></div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">System Idle</span>
            </>
          )}
        </div>
        <div className="flex-1 p-12 lg:p-20">
          {activeTab === 'intro' && <IntroTab setTab={setActiveTab} />}
          {activeTab === 'inputs' && <InputsTab />}
          {activeTab === 'generation' && <GenerationTab />}
          {activeTab === 'evaluation' && <EvaluationTab onRate={fetchStats} stats={stats} />}
          {activeTab === 'gallery' && <GalleryTab onRate={fetchStats} />}
          {activeTab === 'models' && <ModelsTab />}
          {activeTab === 'logs' && <LogsTab />}
        </div>
      </main>

      {showProjectModal && (
        <ProjectManagerModal 
          projectState={projectState} 
          switchProject={switchProject} 
          fetchProjects={fetchProjects} 
          onClose={() => setShowProjectModal(false)}
        />
      )}
    </div>
  );
}

// --- Components ---

function TabButton({ id, label, active, set }) {
  const isActive = active === id;
  return (
    <button
      onClick={() => set(id)}
      className={`w-full text-left py-2 text-sm uppercase tracking-widest transition-colors duration-200 ${
        isActive 
          ? 'font-bold text-neutral-900 border-l-2 border-neutral-900 pl-3 -ml-3' 
          : 'text-neutral-400 hover:text-neutral-900'
      }`}
    >
      {label}
    </button>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex justify-between items-center text-xs uppercase tracking-wider">
      <span className="text-neutral-400">{label}</span>
      <span className="font-semibold text-neutral-900">{value}</span>
    </div>
  );
}

function IntroTab({ setTab }) {
  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      <h2 className="text-4xl font-bold tracking-tighter mb-6">Welcome to Generative RLHF</h2>
      <p className="text-lg text-neutral-600 leading-relaxed mb-12">
        This application is an end-to-end studio for <strong>Reinforcement Learning from Human Feedback (RLHF)</strong>. 
        It allows you to programmatically generate massive amounts of AI art, evaluate them based on your subjective tastes, 
        and train custom Machine Learning models to understand your preferences.
      </p>

      <div className="space-y-8">
        <IntroCard 
          title="1. Data Configuration" 
          desc="Define your prompt segments and dynamic parameters. Build highly complex combinatorial prompts to steer the AI generator."
          onClick={() => setTab('inputs')}
        />
        <IntroCard 
          title="2. Generation" 
          desc="Set a budget and unleash the generator. The app will spawn hundreds of prompt combinations and generate images in the background."
          onClick={() => setTab('generation')}
        />
        <IntroCard 
          title="3. Evaluation" 
          desc="The core of RLHF. Rate the generated images from 0 to 10. The system uses your ratings to actively train its ML models on the fly."
          onClick={() => setTab('evaluation')}
        />
        <IntroCard 
          title="4. Gallery & Models" 
          desc="View how well the AI has learned your taste. The Gallery shows images ranked by the AI's predicted score, while Models shows the performance of the various algorithms."
          onClick={() => setTab('gallery')}
        />
      </div>
    </div>
  );
}

function IntroCard({ title, desc, onClick }) {
  return (
    <div 
      onClick={onClick}
      className="p-6 border border-neutral-200 hover:border-black cursor-pointer group transition-colors"
    >
      <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900 mb-2 group-hover:text-black">{title}</h3>
      <p className="text-sm text-neutral-500 leading-relaxed">{desc}</p>
    </div>
  );
}

const paramColors = [
  "bg-blue-50 text-blue-700 border-blue-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-purple-50 text-purple-700 border-purple-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-cyan-50 text-cyan-700 border-cyan-200",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  "bg-orange-50 text-orange-700 border-orange-200",
];

const getColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return paramColors[Math.abs(hash) % paramColors.length];
};

function HighlightedTextarea({ value, onChange, placeholder, minHeight = "160px" }) {
  const overlayRef = React.useRef(null);
  
  const handleScroll = (e) => {
    if (overlayRef.current) {
      overlayRef.current.scrollTop = e.target.scrollTop;
      overlayRef.current.scrollLeft = e.target.scrollLeft;
    }
  };

  const renderOverlay = () => {
    if (!value) return <span className="text-neutral-400">{placeholder}</span>;
    
    const parts = [];
    let lastIndex = 0;
    const regex = /\{([a-zA-Z0-9_]+)(?::[0-9-]+)?\}/g;
    let match;
    
    while ((match = regex.exec(value)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={`text-${lastIndex}`}>{value.substring(lastIndex, match.index)}</span>);
      }
      const paramKey = match[1];
      const colorClass = getColor(paramKey);
      parts.push(
        <span key={`param-${match.index}`} className={`rounded ${colorClass.split(' ').filter(c => !c.startsWith('border')).join(' ')}`}>
          {match[0]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) {
      parts.push(<span key={`text-${lastIndex}`}>{value.substring(lastIndex)}</span>);
    }
    return parts;
  };

  return (
    <div className="relative w-full bg-white border border-neutral-200 group-hover:border-neutral-900 transition shadow-sm overflow-hidden" style={{ minHeight }}>
      <div 
        ref={overlayRef}
        className="absolute inset-0 p-6 text-sm leading-relaxed whitespace-pre-wrap font-sans text-neutral-900 pointer-events-none break-words overflow-hidden m-0 border-none box-border"
        aria-hidden="true"
      >
        {renderOverlay()}
        {/* Add an extra zero-width space or newline to match textarea behavior at the end */}
        {value.endsWith('\n') && <br />}
      </div>
      <textarea 
        value={value} 
        onChange={onChange}
        onScroll={handleScroll}
        className="absolute inset-0 z-10 w-full h-full p-6 bg-transparent text-transparent caret-black outline-none resize-none block text-sm leading-relaxed whitespace-pre-wrap font-sans break-words m-0 border-none box-border"
        spellCheck="false"
        placeholder={placeholder}
      />
    </div>
  );
}

function InputsTab() {
  const [segments, setSegments] = useState([]);
  const [parameters, setParameters] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/inputs`).then(r => r.json()).then(data => {
      setSegments((data.prompt_segments || []).map(seg => seg.join('\n')));
      const params = data.parameters || {};
      const newParams = {};
      for (const k in params) {
        newParams[k] = params[k].map(group => group.join('\n')).join('\n\n');
      }
      setParameters(newParams);
    });
  }, []);

  const activeParamKeys = [...new Set([...segments.join('\n').matchAll(/\{([a-zA-Z0-9_]+)(?::[0-9-]+)?\}/g)].map(m => m[1]))];

  const handleSave = async () => {
    setSaving(true);
    const cleanParams = {};
    for (const k of activeParamKeys) {
       const groups = (parameters[k] || "").split('\n\n');
       cleanParams[k] = groups.map(g => g.split('\n').filter(s => s.trim())).filter(g => g.length > 0);
    }

    const payload = {
      prompt_segments: segments.map(seg => seg.split('\n').filter(s => s.trim())),
      parameters: cleanParams
    };

    await fetch(`${API_BASE}/inputs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    setSaving(false);
  };

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      <div className="flex justify-between items-end mb-4">
        <h2 className="text-4xl font-bold tracking-tighter">Data Configuration</h2>
        <button 
          onClick={handleSave} 
          className="bg-neutral-900 text-white px-8 py-3 text-sm font-semibold uppercase tracking-widest hover:bg-neutral-700 transition"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-12 max-w-2xl leading-relaxed">
        Define the building blocks of your AI prompts here. Use <span className="font-mono bg-neutral-100 px-1 py-0.5 text-black">{"{parameters}"}</span> to dynamically inject variables into your prompt segments. The generator will randomize combinations to create vast datasets.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-8">
          <div className="flex justify-between items-center border-b border-neutral-200 pb-4">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Prompt Segments</h3>
            <button onClick={() => setSegments([...segments, ""])} className="text-xs font-bold uppercase tracking-widest text-neutral-400 hover:text-black transition">
              + Add Segment
            </button>
          </div>
          
          {segments.map((seg, idx) => (
            <div key={idx} className="relative group">
              <div className="absolute -left-8 top-4 text-xs font-bold text-neutral-300 group-hover:text-neutral-900 transition">{idx + 1}</div>
              
              <HighlightedTextarea 
                value={seg} 
                onChange={e => {
                  const newSegs = [...segments];
                  newSegs[idx] = e.target.value;
                  setSegments(newSegs);
                }}
                placeholder="Enter prompt variants (one per line)..."
              />

              <button 
                onClick={() => setSegments(segments.filter((_, i) => i !== idx))}
                className="absolute top-4 right-4 text-[10px] font-bold uppercase tracking-widest text-neutral-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition z-20"
              >
                Remove
              </button>
            </div>
          ))}
          {segments.length === 0 && <div className="text-sm italic text-neutral-400">No segments added.</div>}
        </div>

        <div>
          <div className="sticky top-12 space-y-8">
            <div className="border-b border-neutral-200 pb-4">
              <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Dynamic Parameters</h3>
            </div>
            
            {activeParamKeys.length > 0 && (
              <div className="mb-8">
                <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-3">Detected Parameters</h3>
                <div className="flex flex-wrap gap-2">
                  {activeParamKeys.map(key => (
                    <span key={key} className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 border ${getColor(key)}`}>
                      {"{" + key + "}"}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="text-xs uppercase tracking-widest text-neutral-400 leading-loose mb-8 border-l-2 border-black pl-4">
              <strong>Pro Tip:</strong> Type <span className="font-mono bg-neutral-100 px-1 py-0.5 text-black">{"{parameter_name}"}</span> or <span className="font-mono bg-neutral-100 px-1 py-0.5 text-black">{"{parameter_name:min-max}"}</span> in your prompt to dynamically select multiple random items. (e.g. <span className="font-mono bg-neutral-100 px-1 py-0.5 text-black">{"{items:5-12}"}</span>)
            </div>
            
            {activeParamKeys.length > 0 && (
              activeParamKeys.map(key => {
                const colorClass = getColor(key);
                return (
                  <div key={key} className="mb-12 relative group">
                    <div className="flex items-center gap-2 mb-3">
                      <label className={`text-sm font-bold uppercase tracking-widest border ${colorClass} px-3 py-1`}>
                        {"{" + key + "}"}
                      </label>
                      
                      <div className="relative flex items-center justify-center w-5 h-5 rounded-full bg-neutral-200 text-neutral-600 text-[10px] font-bold cursor-help group/tooltip">
                        ?
                        <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-neutral-900 text-white text-xs p-3 shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none z-10 hidden group-hover/tooltip:block">
                          <strong>Grouping Rules:</strong>
                          <ul className="list-disc ml-3 mt-1 space-y-1 text-neutral-300">
                            <li><strong>Single line break:</strong> Creates a synonym for the same item.</li>
                            <li><strong>Double line break:</strong> Separates an entirely different item.</li>
                            <li className="mt-2 text-[10px] text-neutral-400"><em>Want multiple items? Use syntax like {"{" + key + ":5-12}"} in your prompt!</em></li>
                          </ul>
                          <div className="absolute left-1/2 -bottom-1 -translate-x-1/2 border-4 border-transparent border-t-neutral-900"></div>
                        </div>
                      </div>
                    </div>

                    <textarea 
                      value={parameters[key] || ""} 
                      onChange={e => setParameters({...parameters, [key]: e.target.value})}
                      className="w-full min-h-[300px] p-4 border border-neutral-200 focus:border-neutral-900 outline-none text-sm bg-neutral-50/50 leading-relaxed"
                      placeholder="Example:&#10;A rotting apple&#10;A decaying apple&#10;&#10;A heavy brass compass&#10;A tarnished compass"
                    />
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GenerationTab() {
  const [budget, setBudget] = useState(2.00);
  const [calls, setCalls] = useState(50);
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState([]);
  const [strategy, setStrategy] = useState("random");
  const [candidatesCount, setCandidatesCount] = useState(10000);
  const [sortMetric, setSortMetric] = useState('recall_20');

  const fetchStatus = async () => {
    const res = await fetch(`${API_BASE}/generate/status`, { cache: 'no-store' });
    if (res.ok) setStatus(await res.json());
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    
    fetch(`${API_BASE}/models`)
      .then(res => res.json())
      .then(data => setModels(data || []))
      .catch(console.error);
      
    return () => clearInterval(interval);
  }, []);

  const startGen = async () => {
    await fetch(`${API_BASE}/generate/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ budget, max_calls: calls, temperatures: [0, 0, 0, 0.5, 0.8], strategy, candidates_count: candidatesCount || 10000 })
    });
    fetchStatus();
  };

  const stopGen = async () => {
    await fetch(`${API_BASE}/generate/stop`, { method: 'POST' });
    fetchStatus();
  };

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-4xl font-bold tracking-tighter mb-4">Generation</h2>
      <p className="text-sm text-neutral-500 mb-12 max-w-2xl leading-relaxed">
        Set your budget and start the engine. The system will use your Data Configuration to dynamically assemble prompts and call the Google Gemini API in the background.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="p-8 border border-neutral-200 bg-white">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-8 text-neutral-900">Parameters</h3>
          
          <div className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-2">Max Budget ($)</label>
              <input type="number" step="0.1" value={budget} onChange={e => setBudget(parseFloat(e.target.value))} 
                className="w-full border-b border-neutral-300 py-2 text-lg focus:border-neutral-900 outline-none transition" />
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-2">Max API Calls</label>
                <input type="number" value={calls} onChange={e => setCalls(parseInt(e.target.value) || 0)} 
                  className="w-full border-b border-neutral-300 py-2 text-lg focus:border-neutral-900 outline-none transition" />
              </div>
              
              <div className="relative">
                <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-2 flex items-center gap-2">
                  Candidates
                  <div className="group relative flex items-center cursor-help">
                    <span className="w-3.5 h-3.5 rounded-full border border-neutral-300 flex items-center justify-center text-[9px] font-bold text-neutral-400 group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-900 transition-colors">?</span>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 bg-black text-white text-[10px] p-2.5 font-normal rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center uppercase tracking-widest leading-relaxed shadow-xl">
                      How many combinations to evaluate using AI before picking the absolute best one to generate.
                      <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-black"></div>
                    </div>
                  </div>
                </label>
                <input type="number" value={candidatesCount} onChange={e => setCandidatesCount(parseInt(e.target.value) || 0)} 
                  className="w-full border-b border-neutral-300 py-2 text-lg focus:border-neutral-900 outline-none transition" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-2">Sort Metric</label>
                <select value={sortMetric} onChange={e => setSortMetric(e.target.value)} 
                  className="w-full border-b border-neutral-300 py-2 text-sm focus:border-neutral-900 outline-none transition bg-transparent cursor-pointer">
                  <option value="recall_20">Recall@20 (Find Best)</option>
                  <option value="precision_20">Precision@20 (Density)</option>
                  <option value="ndcg">NDCG@20 (Strict Order)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-neutral-400 mb-2">AI Strategy</label>
                <select value={strategy} onChange={e => setStrategy(e.target.value)} 
                  className="w-full border-b border-neutral-300 py-2 text-sm focus:border-neutral-900 outline-none transition bg-transparent cursor-pointer">
                  <option value="random">Random (No AI)</option>
                  <option value="active_learning">Active Learning (Default)</option>
                  {[...models].sort((a, b) => (b[sortMetric] || 0) - (a[sortMetric] || 0)).map(m => (
                    <option key={m.id} value={m.id}>{m.name} ({(m[sortMetric] || 0).toFixed(2)})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-8">
              {!status?.is_generating ? (
                <button onClick={startGen} className="w-full cursor-pointer bg-neutral-900 text-white font-bold uppercase tracking-widest text-sm py-4 hover:bg-neutral-800 transition">
                  Initialize Generation
                </button>
              ) : (
                <button onClick={stopGen} className="w-full cursor-pointer border border-neutral-900 text-neutral-900 font-bold uppercase tracking-widest text-sm py-4 hover:bg-neutral-100 transition">
                  Halt Process
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-8 border border-neutral-200 bg-neutral-50 flex flex-col">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-neutral-900">Live Telemetry</h3>
            {status?.is_generating && <span className="w-2 h-2 rounded-full bg-black animate-pulse"></span>}
          </div>
          
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-400 mb-1">Expenditure</div>
              <div className="text-3xl font-light tracking-tighter">${status?.current_cost?.toFixed(2) || '0.00'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-400 mb-1">API Calls</div>
              <div className="text-3xl font-light tracking-tighter">{status?.api_calls_made || 0} <span className="text-neutral-400 text-lg">/ {status?.max_calls || 0}</span></div>
            </div>
          </div>

          <div className="flex-1 border-t border-neutral-200 pt-6">
            <div className="text-xs font-bold uppercase tracking-widest text-neutral-400 mb-4">System Output</div>
            <div className="h-48 overflow-y-auto font-mono text-[11px] leading-relaxed text-neutral-600">
              {status?.messages?.length ? status.messages.map((m, i) => (
                <div key={i} className="mb-1">{m}</div>
              )) : <div className="italic">Awaiting instructions...</div>}
            </div>
          </div>
        </div>
      </div>

      {status?.recent_images?.length > 0 && (
        <div className="mt-12 animate-fade-in">
          <h3 className="text-sm font-bold uppercase tracking-widest mb-6 text-neutral-900">Live Filmstrip</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {status.recent_images.map((img) => (
              <div key={img.image_name} className="relative group border border-neutral-200 bg-white p-2">
                <img 
                  src={`${ASSET_BASE}/${img.relative_path}`} 
                  alt="Generated" 
                  className="w-full h-32 object-cover"
                />
                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-3 pointer-events-none">
                  <div className="text-[9px] font-mono text-neutral-400 truncate w-full mb-1">T={img.temperature}</div>
                  <div className="text-[10px] font-bold text-white uppercase tracking-widest">
                    Score: {img.probability.toFixed(1)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function EvaluationTab({ onRate, stats }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchNext = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/rating/next`, { cache: 'no-store' });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNext();
  }, [fetchNext]);

  const submitRating = useCallback(async (rating) => {
    if (!data?.image?.image_name) return;
    await fetch(`${API_BASE}/rating/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_name: data.image.image_name, rating })
    });
    onRate();
    fetchNext();
  }, [data, fetchNext, onRate]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      const key = parseInt(e.key);
      if (!isNaN(key) && key >= 0 && key <= 9) {
        submitRating(key);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [submitRating]);

  if (loading && !data) return <div className="flex items-center justify-center h-full text-sm uppercase tracking-widest text-neutral-400">Loading...</div>;
  if (data?.status === 'done') {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-6">
        <div className="w-24 h-24 rounded-full bg-neutral-100 flex items-center justify-center mb-2">
           <svg className="w-10 h-10 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
           </svg>
        </div>
        <h2 className="text-4xl font-bold tracking-tighter text-black">You're all caught up!</h2>
        <p className="text-sm text-neutral-500 max-w-md leading-relaxed">
          There are no more images left to evaluate. Head over to the <span className="font-bold text-black">Data Config</span> tab to generate a new batch of covers, or review your rankings in the <span className="font-bold text-black">Gallery</span>.
        </p>
      </div>
    );
  }
  if (!data?.image) return null;

  return (
    <div className="max-w-2xl mx-auto pb-20">
      <div className="flex justify-between items-end mb-4">
        <div className="flex items-center gap-4">
          <h2 className="text-4xl font-bold tracking-tighter">Evaluation</h2>
          <div className="flex gap-2">
            <span className="bg-black text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
              {data.unrated_count} Left
            </span>
            {stats && (
              <span className="border border-neutral-300 text-neutral-500 text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full">
                {stats.rated_count} Rated
              </span>
            )}
          </div>
        </div>
        <div className={`text-xs font-bold uppercase tracking-widest ${data.is_ai_selected ? 'text-black' : 'text-neutral-400'}`}>
          {data.is_ai_selected ? 'Active Learning' : 'Random Sample'}
        </div>
      </div>
      <p className="text-sm text-neutral-500 mb-8 max-w-xl leading-relaxed">
        Train the AI by rating these images from 0 to 10 based on your preference. You can use your keyboard numbers (0-9) for rapid rating.
      </p>

      <div className="border border-neutral-200 p-2 bg-white shadow-sm">
        <img 
          src={`${ASSET_BASE}/${data.image.image_path.split('batch_outputs/')[1] || data.image.image_path}`} 
          alt="AI Generated" 
          className="w-full h-auto max-h-[60vh] object-contain bg-neutral-50"
        />
        
        <div className="p-8 pb-4">
          <div className="flex justify-center gap-4 mb-8">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => (
              <button 
                key={num}
                onClick={() => submitRating(num)}
                className="w-12 h-12 rounded-full border border-neutral-300 hover:border-neutral-900 hover:bg-neutral-900 hover:text-white text-lg font-light transition-colors"
              >
                {num}
              </button>
            ))}
          </div>

          <div className="border-t border-neutral-100 pt-6">
            <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-2">Prompt Data (T={data.image.temperature})</div>
            <div className="text-sm text-neutral-600 leading-relaxed font-serif italic">{data.image.prompt_text}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function GalleryTab({ onRate }) {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [view, setView] = useState('top');
  const [items, setItems] = useState([]);
  const [modelItems, setModelItems] = useState({});
  const [isTraining, setIsTraining] = useState(false);

  const fetchModels = async () => {
    const res = await fetch(`${API_BASE}/models`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setModels(data);
      if (data.length > 0 && !selectedModel) setSelectedModel(data[0].id);
    }
  };

  useEffect(() => {
    fetchModels();
    const interval = setInterval(async () => {
      const res = await fetch(`${API_BASE}/models/status`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setIsTraining(data.is_training);
        if (data.is_training) fetchModels();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [selectedModel]);

  useEffect(() => {
    if (selectedModel && view !== 'side_by_side') {
      fetch(`${API_BASE}/gallery?model_id=${selectedModel}&view=${view}`, { cache: 'no-store' })
        .then(r => r.json()).then(data => setItems(data.items || []));
    } else if (view === 'side_by_side' && models.length > 0) {
      Promise.all(models.map(m => 
        fetch(`${API_BASE}/gallery?model_id=${m.id}&view=top`, { cache: 'no-store' }).then(r => r.json())
      )).then(results => {
        const newModelItems = {};
        results.forEach((res, i) => {
          newModelItems[models[i].id] = res.items || [];
        });
        setModelItems(newModelItems);
      });
    }
  }, [selectedModel, view, models]);

  const updateRating = async (image_name, rating) => {
    await fetch(`${API_BASE}/rating/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_name, rating })
    });
    const updateArr = arr => arr.map(it => it.image_name === image_name ? { ...it, real_score: rating } : it);
    setItems(updateArr(items));
    
    const newModelItems = {};
    for (const [modId, arr] of Object.entries(modelItems)) {
      newModelItems[modId] = updateArr(arr);
    }
    setModelItems(newModelItems);
    onRate();
  };

  const renderCompactItem = (item, idx, total, viewMode) => (
    <div key={item.image_name} className="group flex flex-col border border-neutral-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <div className="relative">
        <img src={`${ASSET_BASE}/${item.relative_path}`} alt="Cover" className="w-full h-auto object-contain bg-neutral-50" />
        <div className="absolute top-2 left-2 bg-black text-white px-2 py-1 text-[10px] font-bold uppercase tracking-widest shadow-lg">
          Rank {viewMode === 'top' || viewMode === 'actual_top' ? idx + 1 : total - idx}
        </div>
      </div>
      <div className="p-3">
        <div className="flex justify-between items-end gap-2">
          <div className="overflow-hidden flex-1">
            <div className="text-[9px] uppercase tracking-widest text-neutral-400 mb-1 truncate">P(T={item.temperature})</div>
            <div className="text-xs text-neutral-600 font-serif italic truncate" title={item.prompt_text}>{item.prompt_text}</div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[9px] uppercase tracking-widest text-neutral-400 mb-1">Pred</div>
            <div className="text-sm font-bold">{item.pred_score.toFixed(3)}</div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className={view === 'side_by_side' ? "max-w-none w-full mx-auto px-8" : "max-w-7xl mx-auto"}>
      <div className="flex justify-between items-end mb-4 border-b border-neutral-200 pb-6">
        <div>
          <h2 className="text-4xl font-bold tracking-tighter mb-2">Gallery</h2>
          <p className="text-sm text-neutral-500 max-w-xl leading-relaxed">
            View the dataset ranked through the eyes of the machine. The AI attempts to predict your 0-10 score for every image based on the underlying prompt semantics.
          </p>
        </div>
        <div className="flex gap-8 items-center">
          <select 
            value={selectedModel} 
            onChange={e => setSelectedModel(e.target.value)}
            className="text-sm font-semibold uppercase tracking-widest bg-transparent outline-none cursor-pointer border-b border-neutral-300 pb-1"
          >
            {models.map(m => <option key={m.id} value={m.id}>{m.name} (NDCG: {m.ndcg.toFixed(3)})</option>)}
          </select>

          <div className="flex gap-4">
            <select
              value={view}
              onChange={e => setView(e.target.value)}
              className="text-xs font-bold uppercase tracking-widest bg-transparent outline-none cursor-pointer border-b border-neutral-300 pb-1"
            >
              <option value="top">Predicted Top 20</option>
              <option value="bottom">Predicted Bottom 20</option>
              <option value="actual_top">Actual Top 20</option>
              <option value="actual_bottom">Actual Bottom 20</option>
              <option value="all">Full Grid</option>
              <option value="side_by_side">Side-by-Side Comparison</option>
            </select>
          </div>
        </div>
      </div>

      {view === 'side_by_side' && (
        <div className="flex gap-8 w-full overflow-x-auto pb-8 snap-x">
          {models.map(m => (
            <div key={m.id} className="flex flex-col min-w-[320px] max-w-[320px] flex-none snap-start">
              <div className="mb-4 flex flex-col gap-1 border-b border-neutral-200 pb-2">
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-800 truncate">{m.name}</span>
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-400">NDCG: {m.ndcg.toFixed(3)}</span>
              </div>
              <div className="flex flex-col space-y-6 w-full">
                {(modelItems[m.id] || []).map((item, idx) => renderCompactItem(item, idx, (modelItems[m.id] || []).length, 'top'))}
              </div>
            </div>
          ))}
        </div>
      )}

      {view === 'all' && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 max-w-full">
          {items.map((item, idx) => (
             <div key={item.image_name} className="relative group cursor-pointer border border-neutral-200">
                <img src={`${ASSET_BASE}/${item.relative_path}`} alt="Grid Item" className="w-full h-auto object-cover aspect-square" />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-80 transition-all flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100">
                    <span className="text-white text-[10px] uppercase tracking-widest mb-1">Rank {idx + 1}</span>
                    <span className="text-white text-sm font-bold">{item.pred_score.toFixed(3)}</span>
                    <span className="text-neutral-400 text-[10px] truncate mt-1">{item.prompt_text}</span>
                </div>
             </div>
          ))}
        </div>
      )}

      {view !== 'all' && view !== 'side_by_side' && (
        <div className="flex flex-col space-y-24 max-w-4xl mx-auto">
          {items.map((item, idx) => (
            <div key={item.image_name} className="group flex flex-col">
              <div className="border border-neutral-200 p-8 mb-6 bg-white shadow-sm flex justify-center py-12 pl-[15%]">
                <div className="relative inline-block max-w-full">
                  <img src={`${ASSET_BASE}/${item.relative_path}`} alt="Cover" className="max-w-full h-auto max-h-[80vh] object-contain shadow-sm" />
                  <div className="absolute top-12 left-0 transform -translate-x-[90%] bg-black text-white px-6 py-2 text-xs font-bold uppercase tracking-widest shadow-xl border border-white/20 z-10 whitespace-nowrap">
                    Rank {view === 'top' || view === 'actual_top' ? idx + 1 : items.length - idx}
                  </div>
                </div>
              </div>
              
              <div className="px-4">
                <div className="flex justify-between items-end mb-6">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-neutral-400 mb-2">Prompt Data (T={item.temperature})</div>
                    <div className="text-base text-neutral-600 leading-relaxed font-serif italic">{item.prompt_text}</div>
                  </div>
                  <div className="text-right ml-8 shrink-0">
                    <div className="text-[10px] uppercase tracking-widest text-neutral-400 mb-1">Predicted Score</div>
                    <div className="text-2xl font-light tracking-tighter">{item.pred_score.toFixed(3)}</div>
                  </div>
                </div>
                
                <div className="flex justify-between gap-4 mt-4 border-t border-neutral-100 pt-6">
                  <span className={`text-sm font-bold uppercase tracking-widest self-center ${item.real_score >= 4 ? 'text-black' : 'text-neutral-400'}`}>
                    Your Rating: {item.real_score} / 10
                  </span>
                  <div className="flex gap-1 w-2/3">
                  {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                    <button key={n} onClick={() => updateRating(item.image_name, n)}
                      className={`flex-1 py-3 text-sm font-bold transition-colors border ${n == item.real_score ? 'bg-black text-white border-black shadow-md' : 'bg-transparent text-neutral-400 border-neutral-200 hover:border-black hover:text-black'}`}>
                      {n}
                    </button>
                  ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {view !== 'side_by_side' && items.length === 0 && (
        <div className="col-span-full text-center text-sm uppercase tracking-widest text-neutral-400 py-20 flex flex-col items-center gap-4">
          {isTraining ? (
            <>
              <span className="w-3 h-3 rounded-full bg-black animate-ping mb-2"></span>
              <span className="text-xs text-neutral-300">Models will appear here as they finish.</span>
            </>
          ) : (
            <span>No data available</span>
          )}
        </div>
      )}
    </div>
  );
}

function ModelsTab() {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState({ is_training: false, progress: 0, step: "" });
  const [sortMetric, setSortMetric] = useState('ndcg');
  const [forceRefresh, setForceRefresh] = useState(0);

  const [isStopping, setIsStopping] = useState(false);

  const fetchModels = async () => {
    const res = await fetch(`${API_BASE}/models`, { cache: 'no-store' });
    if (res.ok) setModels(await res.json());
  };

  const fetchStatus = async () => {
    const res = await fetch(`${API_BASE}/models/status`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      setStatus(data);
      if (data.is_training) {
        fetchModels();
      } else if (data.is_training === false && status.is_training === true) {
        setIsStopping(false);
        fetchModels();
      }
    }
  };

  useEffect(() => { 
    fetchModels(); 
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, [status.is_training, forceRefresh]);

  const triggerRetrain = async () => {
    await fetch(`${API_BASE}/models/retrain`, { method: 'POST' });
    setForceRefresh(prev => prev + 1);
  };
  
  const stopRetrain = async () => {
    setIsStopping(true);
    await fetch(`${API_BASE}/models/stop`, { method: 'POST' });
    setForceRefresh(prev => prev + 1);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-end mb-4 border-b border-neutral-200 pb-6">
        <div>
          <h2 className="text-4xl font-bold tracking-tighter mb-2">Models</h2>
          <p className="text-sm text-neutral-500 max-w-xl leading-relaxed">
            Review the performance of various Machine Learning architectures predicting your taste. Higher Recall, Precision, or NDCG scores indicate the model is successfully learning your preferences.
          </p>
        </div>
        
        {status.is_training ? (
          <div className="flex gap-6 items-center">
            <div className="flex flex-col w-64 mt-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-400 mb-2 w-full flex items-center justify-end gap-2">
                <svg className="animate-spin h-3.5 w-3.5 text-black shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="truncate">{status.step || "Training Models..."}</span>
              </div>
              <div className="w-full h-1 bg-neutral-200 mt-1">
                <div 
                  className="h-full bg-neutral-900 transition-all duration-500 ease-out" 
                  style={{ width: `${status.progress}%` }}
                ></div>
              </div>
            </div>
            <button 
              onClick={stopRetrain} 
              disabled={isStopping}
              className={`text-xs font-bold uppercase tracking-widest border px-6 py-2 transition ${isStopping ? 'border-neutral-500 text-neutral-500 cursor-not-allowed' : 'border-red-500 text-red-500 hover:bg-red-500 hover:text-white cursor-pointer'}`}
            >
              {isStopping ? "Stopping..." : "Stop Training"}
            </button>
          </div>
        ) : (
          <div className="flex gap-4 items-center">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-1">Rank By Metric</span>
              <select 
                value={sortMetric} 
                onChange={e => setSortMetric(e.target.value)} 
                className="text-xs p-2 border border-neutral-200 outline-none hover:border-black transition-colors"
              >
                <option value="recall_20">Recall@20 (Find Best)</option>
                <option value="precision_20">Precision@20 (Density)</option>
                <option value="ndcg">NDCG@20 (Strict Order)</option>
              </select>
            </div>
            <button 
              onClick={triggerRetrain} 
              className="mt-5 text-xs font-bold uppercase tracking-widest border border-neutral-900 px-6 py-2 hover:bg-neutral-900 hover:text-white transition"
            >
              Retrain Models
            </button>
          </div>
        )}
      </div>

      <table className="w-full text-left">
        <thead>
          <tr className="border-b-2 border-neutral-900">
            <th className="py-4 px-2 text-xs font-bold uppercase tracking-widest text-neutral-400 w-24">Rank</th>
            <th className="py-4 px-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Architecture</th>
            <th className="py-4 px-2 text-xs font-bold uppercase tracking-widest text-neutral-400 text-right">Recall@20</th>
            <th className="py-4 px-2 text-xs font-bold uppercase tracking-widest text-neutral-400 text-right">Precision@20</th>
            <th className="py-4 px-2 text-xs font-bold uppercase tracking-widest text-neutral-400 text-right">NDCG@20</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">
          {[...models].sort((a, b) => (b[sortMetric] || 0) - (a[sortMetric] || 0)).map((m, idx) => (
            <tr key={m.id} className="group">
              <td className="py-6 px-2 text-sm text-neutral-400">{(idx + 1).toString().padStart(2, '0')}</td>
              <td className="py-6 px-2 text-sm font-semibold tracking-tight">{m.name}</td>
              <td className="py-6 px-2 text-right font-mono text-sm">{(m.recall_20 ?? 0).toFixed(4)}</td>
              <td className="py-6 px-2 text-right font-mono text-sm">{(m.precision_20 ?? 0).toFixed(4)}</td>
              <td className="py-6 px-2 text-right font-mono text-sm">{(m.ndcg ?? 0).toFixed(4)}</td>
            </tr>
          ))}
          {models.length === 0 && (
            <tr><td colSpan="5" className="py-12 text-center text-xs uppercase tracking-widest text-neutral-400">{status.is_training ? 'Training First Model...' : 'Insufficient Data for Evaluation'}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function LogsTab() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      const res = await fetch(`${API_BASE}/logs`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs);
      }
    };
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <h2 className="text-4xl font-bold tracking-tighter mb-4">System Logs</h2>
      <p className="text-sm text-neutral-500 mb-12 max-w-2xl leading-relaxed">
        Live telemetry and debug information from the backend generator and machine learning engine.
      </p>
      
      <div className="bg-black text-green-500 p-8 font-mono text-xs h-[600px] overflow-y-auto shadow-inner">
        {logs.length === 0 ? (
          <span className="opacity-50">Awaiting system events...</span>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="mb-2 hover:bg-neutral-900 px-2 py-1 -mx-2 transition-colors">
              <span className="text-neutral-500 mr-4">[{log.time}]</span>
              <span className={
                log.level === 'ERROR' ? 'text-red-500 font-bold' : 
                log.level === 'WARNING' ? 'text-yellow-500' : 'text-green-500'
              }>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ProjectManagerModal({ projectState, switchProject, fetchProjects, onClose }) {
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [copying, setCopying] = useState(null);
  const [copyName, setCopyName] = useState('');
  
  const handleRename = async (oldName) => {
    if (!editName.trim() || editName === oldName) {
      setEditing(null);
      return;
    }
    const res = await fetch(`${API_BASE}/projects/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_name: oldName, new_name: editName })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (oldName === projectState.active) {
         window.location.reload();
      } else {
         fetchProjects();
      }
    } else {
      alert(data.message);
    }
    setEditing(null);
  };

  const handleCopy = async (srcName) => {
    if (!copyName.trim() || copyName === srcName) {
      setCopying(null);
      return;
    }
    const res = await fetch(`${API_BASE}/projects/copy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src_name: srcName, dest_name: copyName })
    });
    const data = await res.json();
    if (data.status === 'success') {
      fetchProjects();
    } else {
      alert(data.message);
    }
    setCopying(null);
  };

  const handleDelete = async (name) => {
    if (!window.confirm(`Are you sure you want to permanently delete project '${name}'? All images and models will be lost.`)) return;
    const res = await fetch(`${API_BASE}/projects/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: name })
    });
    const data = await res.json();
    if (data.status === 'success') {
      if (name === projectState.active) {
        window.location.reload();
      } else {
        fetchProjects();
      }
    } else {
      alert(data.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-8">
      <div className="w-full max-w-5xl bg-white border border-neutral-200 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-neutral-200 flex justify-between items-center bg-neutral-50">
          <div>
            <h2 className="text-3xl font-bold tracking-tighter mb-1 text-black">Manage Projects</h2>
            <p className="text-xs text-neutral-500 uppercase tracking-widest font-semibold">Organize and duplicate your workspaces</p>
          </div>
          <button onClick={onClose} className="text-black hover:text-red-500 font-bold uppercase tracking-widest text-xs border border-black px-4 py-2 hover:bg-black transition-colors cursor-pointer">
            Close
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-8">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-neutral-50 text-[10px] uppercase tracking-widest text-neutral-400 border-b border-neutral-200">
                <th className="px-6 py-4 font-bold text-black">Project Name</th>
                <th className="px-6 py-4 font-bold text-black">Images</th>
                <th className="px-6 py-4 font-bold text-black">Size</th>
                <th className="px-6 py-4 font-bold text-black text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(projectState.details || []).map(p => (
                <tr key={p.name} className={`border-b border-neutral-100 last:border-0 hover:bg-neutral-50 transition-colors ${p.is_active ? 'bg-neutral-50' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {p.is_active && <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)]"></span>}
                      
                      {editing === p.name ? (
                        <input 
                          type="text" 
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          onBlur={() => handleRename(p.name)}
                          onKeyDown={e => e.key === 'Enter' && handleRename(p.name)}
                          className="text-sm font-bold border-b border-black outline-none bg-transparent w-full text-black"
                          autoFocus
                        />
                      ) : copying === p.name ? (
                        <div className="flex items-center gap-2 w-full">
                          <span className="text-xs font-bold text-neutral-400">Copy to:</span>
                          <input 
                            type="text" 
                            value={copyName}
                            onChange={e => setCopyName(e.target.value)}
                            onBlur={() => handleCopy(p.name)}
                            onKeyDown={e => e.key === 'Enter' && handleCopy(p.name)}
                            className="text-sm font-bold border-b border-black outline-none bg-transparent w-full text-black"
                            autoFocus
                            placeholder="New project name..."
                          />
                        </div>
                      ) : (
                        <span className="text-sm font-bold text-black">{p.name}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-600 font-semibold">{p.images}</td>
                  <td className="px-6 py-4 text-sm text-neutral-600 font-mono font-semibold">{p.size}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-4 text-xs font-bold uppercase tracking-widest">
                      {!p.is_active && (
                        <button onClick={() => switchProject(p.name)} className="text-black hover:text-green-600 transition cursor-pointer">Switch</button>
                      )}
                      <button 
                        onClick={() => { setCopying(p.name); setCopyName(p.name + '-copy'); setEditing(null); }} 
                        className="text-neutral-400 hover:text-blue-500 transition cursor-pointer"
                      >
                        Copy
                      </button>
                      <button 
                        onClick={() => { setEditing(p.name); setEditName(p.name); setCopying(null); }} 
                        className="text-neutral-400 hover:text-black transition cursor-pointer"
                      >
                        Rename
                      </button>
                      <button onClick={() => handleDelete(p.name)} className="text-neutral-400 hover:text-red-500 transition cursor-pointer">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
