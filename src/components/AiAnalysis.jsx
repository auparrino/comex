import { useState, useMemo } from 'react';
import { fmt } from '../utils/format';
import './AiAnalysis.css';

const AI_PROVIDERS = [
  {
    name: 'Cerebras',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    model: 'qwen-3-235b-a22b-instruct-2507',
    envKey: import.meta.env.VITE_CEREBRAS_API_KEY || '',
    keyStorage: 'comex_cerebras_key',
  },
  {
    name: 'Mistral',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    model: 'mistral-small-latest',
    envKey: import.meta.env.VITE_MISTRAL_API_KEY || '',
    keyStorage: 'comex_mistral_key',
  },
];

// Helper: get API key for a provider (env var takes precedence, then localStorage)
function getProviderKey(provider) {
  return provider.envKey || localStorage.getItem(provider.keyStorage) || '';
}

function buildPrompt(country, tradeData, bilateralData, selectedYears) {
  const yearRange = selectedYears.length > 1
    ? `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}`
    : selectedYears[0];

  let totalExp = 0, totalImp = 0;
  for (const yr of selectedYears) {
    const yd = tradeData.summary[country]?.years?.[yr];
    if (yd) { totalExp += yd.exp; totalImp += yd.imp; }
  }
  const balance = totalExp - totalImp;

  // Top products from bilateral data
  let topExpProducts = '';
  let topImpProducts = '';
  let opportunities = '';
  let dependencies = '';

  if (bilateralData) {
    if (bilateralData.top_exp?.length) {
      topExpProducts = bilateralData.top_exp.slice(0, 8).map(p =>
        `- ${p.d} (HS ${p.p}): ${fmt(p.t)} (${p.sh}% del total AR, tendencia: ${p.tr})`
      ).join('\n');
    }
    if (bilateralData.top_imp?.length) {
      topImpProducts = bilateralData.top_imp.slice(0, 8).map(p =>
        `- ${p.d} (HS ${p.p}): ${fmt(p.t)} (${p.sh}% del total AR, tendencia: ${p.tr})`
      ).join('\n');
    }
    if (bilateralData.opp_exp?.length) {
      opportunities = bilateralData.opp_exp.slice(0, 5).map(p =>
        `- ${p.d} (HS ${p.p}): AR exporta ${fmt(p.ar_global)} al mundo, solo ${fmt(p.bilateral)} a ${country} (gap: ${p.gap}%)`
      ).join('\n');
    }
    if (bilateralData.dep_imp?.length) {
      dependencies = bilateralData.dep_imp.slice(0, 5).map(p =>
        `- ${p.d} (HS ${p.p}): ${p.sh}% de las importaciones AR provienen de ${country} (${fmt(p.bilateral)} de ${fmt(p.ar_total)})`
      ).join('\n');
    }
  }

  return `Eres un analista de comercio exterior. Da un pantallazo MUY breve (máximo 150 palabras) de la relación comercial bilateral. No uses secciones ni títulos. Escribe 1 párrafo corto de resumen y luego 3-4 bullet points con lo más destacado. Directo al grano, sin introducciones.

Argentina ↔ ${country} (${yearRange})
Exp FOB: ${fmt(totalExp)} | Imp CIF: ${fmt(totalImp)} | Balance: ${balance >= 0 ? '+' : ''}${fmt(balance)}
${topExpProducts ? `Top exp: ${bilateralData.top_exp.slice(0, 4).map(p => p.d).join(', ')}\n` : ''}${topImpProducts ? `Top imp: ${bilateralData.top_imp.slice(0, 4).map(p => p.d).join(', ')}\n` : ''}${opportunities ? `Oportunidades: ${bilateralData.opp_exp.slice(0, 3).map(p => `${p.d} (gap ${p.gap}%)`).join(', ')}\n` : ''}${dependencies ? `Dependencias: ${bilateralData.dep_imp.slice(0, 3).map(p => `${p.d} (${p.sh}%)`).join(', ')}` : ''}

Responde en español. Máximo 150 palabras.`;
}

async function callAI(prompt, provider, apiKey) {
  const resp = await fetch(provider.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.3,
    }),
  });

  if (!resp.ok) {
    const err = await resp.text().catch(() => '');
    throw new Error(`${provider.name}: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || 'Sin respuesta';
}

export default function AiAnalysis({ country, data, selectedYears }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bilateralData, setBilateralData] = useState(null);
  const [showConfig, setShowConfig] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(0);

  // Check if any API key is configured (env or localStorage)
  const hasKey = useMemo(() => {
    return AI_PROVIDERS.some(p => getProviderKey(p));
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      // Load bilateral data if available
      let bilateral = bilateralData;
      if (!bilateral && data.loadBilateralData) {
        bilateral = await data.loadBilateralData(country);
        setBilateralData(bilateral);
      }

      const prompt = buildPrompt(country, data, bilateral, selectedYears);

      // Try providers in order with fallback
      let lastError = null;
      for (let i = selectedProvider; i < AI_PROVIDERS.length; i++) {
        const provider = AI_PROVIDERS[i];
        const key = getProviderKey(provider);
        if (!key) continue;

        try {
          const result = await callAI(prompt, provider, key);
          setAnalysis({ text: result, provider: provider.name });
          setLoading(false);
          return;
        } catch (err) {
          lastError = err;
        }
      }

      throw lastError || new Error('No hay API keys configuradas');
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleSaveKey = (providerIdx, key) => {
    const provider = AI_PROVIDERS[providerIdx];
    if (key.trim()) {
      localStorage.setItem(provider.keyStorage, key.trim());
    } else {
      localStorage.removeItem(provider.keyStorage);
    }
  };

  // Simple markdown-like rendering
  const renderMarkdown = (text) => {
    return text.split('\n').map((line, i) => {
      // Bold
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      // Headers
      if (line.startsWith('### ')) return <h4 key={i} dangerouslySetInnerHTML={{ __html: line.slice(4) }} />;
      if (line.startsWith('## ')) return <h3 key={i} dangerouslySetInnerHTML={{ __html: line.slice(3) }} />;
      // List items
      if (line.match(/^[\-\*]\s/)) return <li key={i} dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
      if (line.match(/^\d+\.\s/)) return <li key={i} dangerouslySetInnerHTML={{ __html: line.replace(/^\d+\.\s/, '') }} />;
      // Empty lines
      if (!line.trim()) return <br key={i} />;
      return <p key={i} dangerouslySetInnerHTML={{ __html: line }} />;
    });
  };

  return (
    <div className="ai-analysis">
      {!hasKey && !showConfig && (
        <div className="ai-setup">
          <p className="ai-setup-text">
            Para usar el analisis con IA, configura al menos una API key.
            Se usan APIs gratuitas (Cerebras o Mistral).
          </p>
          <button className="ai-config-btn" onClick={() => setShowConfig(true)}>
            Configurar API Keys
          </button>
        </div>
      )}

      {showConfig && (
        <div className="ai-config">
          <h4>Configuracion de APIs</h4>
          {AI_PROVIDERS.map((provider, idx) => (
            <div key={provider.name} className="ai-config-row">
              <label>
                <span className="provider-name">{provider.name}</span>
                <span className="provider-model">{provider.model}</span>
              </label>
              {provider.envKey ? (
                <span className="env-key-status">Configurada via .env</span>
              ) : (
                <input
                  type="password"
                  placeholder={`API Key de ${provider.name}`}
                  defaultValue={localStorage.getItem(provider.keyStorage) || ''}
                  onChange={(e) => handleSaveKey(idx, e.target.value)}
                />
              )}
            </div>
          ))}
          <div className="ai-config-row">
            <label>Proveedor preferido:</label>
            <select value={selectedProvider} onChange={(e) => setSelectedProvider(Number(e.target.value))}>
              {AI_PROVIDERS.map((p, i) => (
                <option key={p.name} value={i}>{p.name}</option>
              ))}
            </select>
          </div>
          <button className="ai-config-btn" onClick={() => setShowConfig(false)}>
            Listo
          </button>
        </div>
      )}

      {hasKey && !loading && !analysis && (
        <div className="ai-ready">
          <p className="ai-ready-text">
            Genera un analisis de la relacion comercial con {country} usando IA.
            Se enviaran los datos de comercio bilateral al modelo para producir un resumen ejecutivo.
          </p>
          <div className="ai-actions">
            <button className="ai-analyze-btn" onClick={handleAnalyze}>
              Analizar con IA
            </button>
            <button className="ai-config-link" onClick={() => setShowConfig(true)}>
              Config
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="ai-loading">
          <div className="ai-spinner" />
          <p>Analizando relacion comercial con {country}...</p>
        </div>
      )}

      {error && (
        <div className="ai-error">
          <p>Error: {error}</p>
          <button className="ai-retry-btn" onClick={handleAnalyze}>Reintentar</button>
        </div>
      )}

      {analysis && (
        <div className="ai-result">
          <div className="ai-result-header">
            <span className="ai-provider-badge">{analysis.provider}</span>
            <button className="ai-retry-btn" onClick={handleAnalyze}>Regenerar</button>
          </div>
          <div className="ai-result-content">
            {renderMarkdown(analysis.text)}
          </div>
        </div>
      )}
    </div>
  );
}
