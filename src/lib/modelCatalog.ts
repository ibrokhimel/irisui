/**
 * A curated catalog of well-known models from the Ollama library, for the
 * "Browse models" discovery view. Sizes are approximate ballparks (labeled ~).
 * Any model — even one not listed here — can still be installed by exact name
 * from the "Install a model" input.
 */

export type ModelCategory = 'General' | 'Code' | 'Reasoning' | 'Vision' | 'Embedding' | 'Small'

export interface CatalogModel {
  name: string
  label: string
  blurb: string
  approxSize: string
  category: ModelCategory
}

export const MODEL_CATEGORIES: ModelCategory[] = [
  'General',
  'Code',
  'Reasoning',
  'Vision',
  'Embedding',
  'Small',
]

export const MODEL_CATALOG: CatalogModel[] = [
  // General
  { name: 'llama3.2:3b', label: 'Llama 3.2 3B', blurb: 'Small, fast, general-purpose (Meta).', approxSize: '~2 GB', category: 'General' },
  { name: 'llama3.1:8b', label: 'Llama 3.1 8B', blurb: 'Capable all-rounder, solid default.', approxSize: '~4.9 GB', category: 'General' },
  { name: 'llama3.3:70b', label: 'Llama 3.3 70B', blurb: 'Large, high-quality general model.', approxSize: '~43 GB', category: 'General' },
  { name: 'qwen2.5:7b', label: 'Qwen 2.5 7B', blurb: 'Strong multilingual and coding model.', approxSize: '~4.7 GB', category: 'General' },
  { name: 'qwen2.5:14b', label: 'Qwen 2.5 14B', blurb: 'Bigger Qwen for tougher tasks.', approxSize: '~9 GB', category: 'General' },
  { name: 'qwen2.5:32b', label: 'Qwen 2.5 32B', blurb: 'High-capability multilingual model.', approxSize: '~20 GB', category: 'General' },
  { name: 'gemma3:4b', label: 'Gemma 3 4B', blurb: 'Efficient open model from Google.', approxSize: '~3.3 GB', category: 'General' },
  { name: 'gemma3:12b', label: 'Gemma 3 12B', blurb: 'Mid-size Gemma with strong quality.', approxSize: '~8.1 GB', category: 'General' },
  { name: 'gemma3:27b', label: 'Gemma 3 27B', blurb: 'Largest Gemma 3 open model.', approxSize: '~17 GB', category: 'General' },
  { name: 'gemma2:9b', label: 'Gemma 2 9B', blurb: 'Well-rounded previous-gen Gemma.', approxSize: '~5.4 GB', category: 'General' },
  { name: 'mistral', label: 'Mistral 7B', blurb: 'Fast, well-rounded 7B model.', approxSize: '~4.1 GB', category: 'General' },
  { name: 'mistral-nemo:12b', label: 'Mistral Nemo 12B', blurb: 'Larger Mistral with long context.', approxSize: '~7.1 GB', category: 'General' },
  { name: 'mixtral:8x7b', label: 'Mixtral 8x7B', blurb: 'Mixture-of-experts, strong quality.', approxSize: '~26 GB', category: 'General' },
  { name: 'phi4', label: 'Phi-4', blurb: 'Compact model tuned for reasoning.', approxSize: '~9 GB', category: 'General' },
  { name: 'command-r:35b', label: 'Command R 35B', blurb: 'RAG- and tool-use-oriented model.', approxSize: '~20 GB', category: 'General' },
  { name: 'granite3.1-dense:8b', label: 'Granite 3.1 8B', blurb: 'IBM open enterprise model.', approxSize: '~4.9 GB', category: 'General' },

  // Code
  { name: 'qwen2.5-coder:7b', label: 'Qwen 2.5 Coder 7B', blurb: 'Strong open coding model.', approxSize: '~4.7 GB', category: 'Code' },
  { name: 'qwen2.5-coder:1.5b', label: 'Qwen 2.5 Coder 1.5B', blurb: 'Tiny, fast code completion.', approxSize: '~1 GB', category: 'Code' },
  { name: 'codellama:7b', label: 'Code Llama 7B', blurb: 'Meta code model, 7B.', approxSize: '~3.8 GB', category: 'Code' },
  { name: 'codellama:13b', label: 'Code Llama 13B', blurb: 'Larger Code Llama.', approxSize: '~7.4 GB', category: 'Code' },
  { name: 'codegemma:7b', label: 'CodeGemma 7B', blurb: 'Google code-tuned Gemma.', approxSize: '~5 GB', category: 'Code' },
  { name: 'deepseek-coder-v2:16b', label: 'DeepSeek Coder V2 16B', blurb: 'MoE coder, strong quality.', approxSize: '~8.9 GB', category: 'Code' },
  { name: 'starcoder2:3b', label: 'StarCoder2 3B', blurb: 'Compact code model.', approxSize: '~1.7 GB', category: 'Code' },

  // Reasoning
  { name: 'deepseek-r1:1.5b', label: 'DeepSeek-R1 1.5B', blurb: 'Tiny reasoning model.', approxSize: '~1.1 GB', category: 'Reasoning' },
  { name: 'deepseek-r1:7b', label: 'DeepSeek-R1 7B', blurb: 'Reasoning-focused distilled model.', approxSize: '~4.7 GB', category: 'Reasoning' },
  { name: 'deepseek-r1:8b', label: 'DeepSeek-R1 8B', blurb: 'Llama-based R1 distill.', approxSize: '~5.2 GB', category: 'Reasoning' },
  { name: 'deepseek-r1:14b', label: 'DeepSeek-R1 14B', blurb: 'Stronger R1 distill.', approxSize: '~9 GB', category: 'Reasoning' },
  { name: 'qwq:32b', label: 'QwQ 32B', blurb: 'Qwen reasoning model.', approxSize: '~20 GB', category: 'Reasoning' },

  // Vision
  { name: 'llama3.2-vision:11b', label: 'Llama 3.2 Vision 11B', blurb: 'Image understanding + chat.', approxSize: '~7.9 GB', category: 'Vision' },
  { name: 'llava:7b', label: 'LLaVA 7B', blurb: 'Popular open vision model.', approxSize: '~4.7 GB', category: 'Vision' },
  { name: 'llava:13b', label: 'LLaVA 13B', blurb: 'Larger LLaVA vision model.', approxSize: '~8 GB', category: 'Vision' },
  { name: 'moondream', label: 'Moondream', blurb: 'Tiny, efficient vision model.', approxSize: '~1.7 GB', category: 'Vision' },

  // Embedding
  { name: 'nomic-embed-text', label: 'Nomic Embed', blurb: 'Text-embedding model (not for chat).', approxSize: '~0.3 GB', category: 'Embedding' },
  { name: 'mxbai-embed-large', label: 'mxbai Embed Large', blurb: 'High-quality text embeddings.', approxSize: '~0.7 GB', category: 'Embedding' },
  { name: 'snowflake-arctic-embed', label: 'Arctic Embed', blurb: 'Snowflake embedding model.', approxSize: '~0.7 GB', category: 'Embedding' },
  { name: 'all-minilm', label: 'all-MiniLM', blurb: 'Very small sentence embeddings.', approxSize: '~0.05 GB', category: 'Embedding' },

  // Small
  { name: 'llama3.2:1b', label: 'Llama 3.2 1B', blurb: 'Ultra-light general model.', approxSize: '~1.3 GB', category: 'Small' },
  { name: 'qwen2.5:0.5b', label: 'Qwen 2.5 0.5B', blurb: 'Tiny model for constrained setups.', approxSize: '~0.4 GB', category: 'Small' },
  { name: 'qwen2.5:1.5b', label: 'Qwen 2.5 1.5B', blurb: 'Small and quick.', approxSize: '~1 GB', category: 'Small' },
  { name: 'gemma3:1b', label: 'Gemma 3 1B', blurb: 'Smallest Gemma 3.', approxSize: '~0.8 GB', category: 'Small' },
  { name: 'tinyllama', label: 'TinyLlama 1.1B', blurb: 'Minimal footprint chat model.', approxSize: '~0.6 GB', category: 'Small' },
  { name: 'smollm2:1.7b', label: 'SmolLM2 1.7B', blurb: 'Efficient small model.', approxSize: '~1.8 GB', category: 'Small' },
  { name: 'phi3:3.8b', label: 'Phi-3 Mini', blurb: 'Small, capable Microsoft model.', approxSize: '~2.2 GB', category: 'Small' },
]
