import { App, Plugin, PluginSettingTab, Setting, TFile } from "obsidian";
interface SecondBrainPluginSettings {
	openaiApiKey: string;
  }
  
  const DEFAULT_SETTINGS: SecondBrainPluginSettings = {
	openaiApiKey: "",
  };
  export default class SecondBrainPlugin extends Plugin {
	settings: SecondBrainPluginSettings;
	// We'll store embeddings in memory as an array of objects
	embeddingsIndex: Array<{ filePath: string; embedding: number[] }> = [];
  
	async onload() {
	  console.log("Loading Second Brain Plugin...");
  
	  // Load settings
	  await this.loadSettings();
  
	  // Create a settings tab so user can set their API key
	  this.addSettingTab(new SecondBrainSettingTab(this.app, this));
  
	  // Build the initial index of embeddings
	  await this.buildEmbeddingsIndex();
  
	  // Listen for note changes
	  this.registerEvent(
		this.app.vault.on("modify", async (file: TFile) => {
		  // If the file is markdown, update the embedding
		  if (file.extension === "md") {
			await this.updateFileEmbedding(file);
		  }
		})
	  );
  
	  // For demonstration, let's log suggestions for any active note
	  // whenever the user changes the editor content
	  this.app.workspace.on("editor-change", async (editor, view) => {
		const content = editor.getValue();
		// Run the getSuggestions method
		const suggestions = await this.getSuggestions(content, 5);
		console.log("Suggestions for current note:", suggestions);
		// In a real plugin, you'd display them in a sidebar or pop-up
	  });
	}
  
	async buildEmbeddingsIndex() {
	  // Get all markdown files
	  const allFiles = this.app.vault.getMarkdownFiles();
  
	  // Clear the current index
	  this.embeddingsIndex = [];
  
	  for (let file of allFiles) {
		console.log("Generating embedding for", file.path);
		// Read file contents
		const content = await this.app.vault.read(file);
		// Get embedding from OpenAI
		const embedding = await this.getOpenAIEmbedding(content);
		// Save to our in-memory index
		this.embeddingsIndex.push({ filePath: file.path, embedding });
	  }
	}
  
	async updateFileEmbedding(file: TFile) {
	  console.log("Updating embedding for", file.path);
	  const content = await this.app.vault.read(file);
	  const embedding = await this.getOpenAIEmbedding(content);
  
	  // Find existing embedding in index
	  const existingIndex = this.embeddingsIndex.findIndex(
		(item) => item.filePath === file.path
	  );
	  if (existingIndex !== -1) {
		// Update it
		this.embeddingsIndex[existingIndex].embedding = embedding;
	  } else {
		// Insert new
		this.embeddingsIndex.push({ filePath: file.path, embedding });
	  }
	}
  
	async getSuggestions(queryText: string, topN: number) {
	  // 1) Get embedding for the query text
	  const queryEmbedding = await this.getOpenAIEmbedding(queryText);
  
	  // 2) Calculate similarity with each note embedding
	  //    We'll do a simple "dot product" or "cosine similarity"
	  //    For simplicity, let's do dot product with normalized vectors
  
	  // We'll store [filePath, similarityScore]
	  let similarities: Array<{ filePath: string; score: number }> = [];
  
	  for (let item of this.embeddingsIndex) {
		const sim = this.cosineSimilarity(queryEmbedding, item.embedding);
		similarities.push({ filePath: item.filePath, score: sim });
	  }
  
	  // 3) Sort by similarity (descending order)
	  similarities.sort((a, b) => b.score - a.score);
  
	  // 4) Return topN results
	  return similarities.slice(0, topN);
	}
  
	// Use a method to call OpenAI’s Embeddings API
	async getOpenAIEmbedding(text: string): Promise<number[]> {
	  const apiKey = this.settings.openaiApiKey;
	  if (!apiKey) {
		console.warn("OpenAI API key not set in plugin settings.");
		return [];
	  }
  
	  try {
		const response = await fetch("https://api.openai.com/v1/embeddings", {
		  method: "POST",
		  headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${apiKey}`,
		  },
		  body: JSON.stringify({
			input: text,
			model: "text-embedding-ada-002",
		  }),
		});
  
		const data = await response.json();
		if (data.data && data.data[0] && data.data[0].embedding) {
		  return data.data[0].embedding;
		}
		return [];
	  } catch (err) {
		console.error("Error fetching embedding:", err);
		return [];
	  }
	}
  
	cosineSimilarity(vecA: number[], vecB: number[]): number {
	  // If either is empty, similarity is 0
	  if (vecA.length === 0 || vecB.length === 0) return 0;
  
	  // Dot product
	  let dot = 0;
	  let normA = 0;
	  let normB = 0;
	  for (let i = 0; i < vecA.length; i++) {
		dot += vecA[i] * vecB[i];
		normA += vecA[i] * vecA[i];
		normB += vecB[i] * vecB[i];
	  }
	  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
	}
  
	async loadSettings() {
	  this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}
  
	async saveSettings() {
	  await this.saveData(this.settings);
	}
  }
  class SecondBrainSettingTab extends PluginSettingTab {
	plugin: SecondBrainPlugin;
  
	constructor(app: App, plugin: SecondBrainPlugin) {
	  super(app, plugin);
	  this.plugin = plugin;
	}
  
	display(): void {
	  let { containerEl } = this;
	  containerEl.empty();
  
	  containerEl.createEl("h2", { text: "Second Brain Plugin Settings" });
  
	  new Setting(containerEl)
		.setName("OpenAI API Key")
		.setDesc("Enter your OpenAI API key to enable semantic embeddings.")
		.addText((text) =>
		  text
			.setPlaceholder("sk-XXXX...")
			.setValue(this.plugin.settings.openaiApiKey)
			.onChange(async (value) => {
			  this.plugin.settings.openaiApiKey = value;
			  await this.plugin.saveSettings();
			})
		);
	}
  }
	  