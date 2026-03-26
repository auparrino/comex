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

function getProviderKey(provider) {
  return provider.envKey || localStorage.getItem(provider.keyStorage) || '';
}

function buildBlocPrompt(bloc, members, totals, selectedYears) {
  const yearRange = selectedYears.length > 1
    ? `${selectedYears[0]}-${selectedYears[selectedYears.length - 1]}`
    : selectedYears[0];

  const memberLines = members.slice(0, 10).map(m =>
    `- ${m.name}: Exp ${fmt(m.exp)}, Imp ${fmt(m.imp)}, Balance ${m.balance >= 0 ? '+' : ''}${fmt(m.balance)}`
  ).join('\n');

  return `Eres un analista de comercio exterior. Da un pantallazo MUY breve (máximo 150 palabras) de la relación comercial de Argentina con el bloque ${bloc.label}. No uses secciones ni títulos. Escribe 1 párrafo corto de resumen y luego 3-4 bullet points con lo más destacado. Directo al grano, sin introducciones.

Argentina ↔ ${bloc.label} (${yearRange})
Exp FOB: ${fmt(totals.exp)} | Imp CIF: ${fmt(totals.imp)} | Balance: ${totals.balance >= 0 ? '+' : ''}${fmt(totals.balance)}
Miembros (${members.length}):
${memberLines}

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

export default function AiBlocAnalysis({ bloc, members, totals, data, selectedYears }) {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const hasKey = useMemo(() => {
    return AI_PROVIDERS.some(p => getProviderKey(p));
  }, []);

  const handleAnalyze = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    try {
      const prompt = buildBlocPrompt(bloc, members, totals, selectedYears);

      let lastError = null;
      for (const provider of AI_PROVIDERS) {
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

  const renderMarkdown = (text) => {
    return text.split('\n').map((line, i) => {
      line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
      if (line.startsWith('### ')) return <h4 key={i} dangerouslySetInnerHTML={{ __html: line.slice(4) }} />;
      if (line.startsWith('## ')) return <h3 key={i} dangerouslySetInnerHTML={{ __html: line.slice(3) }} />;
      if (line.match(/^[\-\*]\s/)) return <li key={i} dangerouslySetInnerHTML={{ __html: line.slice(2) }} />;
      if (line.match(/^\d+\.\s/)) return <li key={i} dangerouslySetInnerHTML={{ __html: line.replace(/^\d+\.\s/, '') }} />;
      if (!line.trim()) return <br key={i} />;
      return <p key={i} dangerouslySetInnerHTML={{ __html: line }} />;
    });
  };

  return (
    <div className="ai-analysis">
      {!hasKey && (
        <div className="ai-setup">
          <p className="ai-setup-text">
            Para usar el analisis con IA, configura las API keys en el archivo .env
            (VITE_CEREBRAS_API_KEY o VITE_MISTRAL_API_KEY).
          </p>
        </div>
      )}

      {hasKey && !loading && !analysis && (
        <div className="ai-ready">
          <p className="ai-ready-text">
            Genera un analisis de la relacion comercial de Argentina con {bloc.label} usando IA.
          </p>
          <div className="ai-actions">
            <button className="ai-analyze-btn" onClick={handleAnalyze}>
              Analizar {bloc.label} con IA
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="ai-loading">
          <div className="ai-spinner" />
          <p>Analizando relacion con {bloc.label}...</p>
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
