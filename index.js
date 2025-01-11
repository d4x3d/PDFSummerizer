require('dotenv').config()
const Groq = require("groq-sdk");
const pdf = require('pdf-parse');
const prompts = require('prompts');
const fs = require('fs/promises');
const path = require('path');
prompts.override(require('yargs').argv);

// Check if ENV key is set
if (!process.env.GROQ_API_KEY) {
	console.log('No Groq API key found.')
	return
}

// Initialize the Groq client
const groq = new Groq({
	apiKey: process.env.GROQ_API_KEY,
});

// Run the script in an async function
(async () => {
	// Groq's available models you can add as much model as you want and test them
	//https://console.groq.com/docs/models
	const models = [
		{ title: 'llama-3.3-70b-versatile', value: 'llama-3.3-70b-versatile' },
		{ title: 'LLaMA2 70B (4K context)', value: 'llama2-70b-4096' }

	];

	// Lets the user pick a model
	const modelSelected = await prompts([
		{
			type: 'select',
			name: 'model',
			message: 'Pick a model from Groq',
			choices: models,
			initial: 0
		}
	]);
	
	// If no model is selected, throw an error
	if (!modelSelected.model) {
		console.log('No model selected. Please try again.')
		return
	}

	// Get all the files in the files folder
	let allFiles = await fs.readdir('./files')
	let pdfs = allFiles.filter(file => path.extname(file).toLowerCase() === '.pdf');

	// Map all the pdfs to an object with a title and value
	let choices = pdfs.map(pdf => {
		return { title: pdf, value: `${pdf}` }
	})

	// If the folder files has no pdf file extensions, throw an error
	if (choices.length === 0) {
		console.log('No PDFs found in ./files folder. Please add some PDFs and try again.')
		return
	}

  	// Lets the user pick a PDF to summarize
	const pdfSelected = await prompts([
		{
			type: 'select',
			name: 'filename',
			message: 'Pick a PDF to summarize',
			choices,
		}
	]);

	// If no pdf selected, throw an error
	if (!pdfSelected.filename) {
		console.log('No PDF selected. Please try again.')
		return
	}

	// Add the path to the pdfSelected object
	pdfSelected.path = `./files/${pdfSelected.filename}`

	// The dataBuffer is a buffer instance, so we need to convert it to a string
	const dataBuffer = await fs.readFile(pdfSelected.path);

	// The pdf function returns a promise, so we need to await it
	pdfSelected.text = await pdf(dataBuffer).then(data => data.text)

	// Separate pdfSelected.text into 500 character chunks
	pdfSelected.chunks = []
	const chunkSize = 500 * 4;

	// Loop through the PDF text and add each chunk to the chunks array
	for (let i = 0; i < pdfSelected.text.length; i += chunkSize) {
		pdfSelected.chunks.push(pdfSelected.text.slice(i, i + chunkSize));
	}

	
	console.log (`${pdfSelected.filename} has ${pdfSelected.chunks.length} pages and ${pdfSelected.text.length} characteres. This is around ${pdfSelected.text.length/4} tokens.`)

	// Create an array to hold all the AI responses
	pdfSelected.summaries = []

	
	
	// Loop through each chunk and perform an AI lookup
	for (let i = 0; i < pdfSelected.chunks.length; i++) {
		const completion = await groq.chat.completions.create({
			messages: [
				{
					role: "system",
					content: "You are a tool that Summarizes PDF. This tool is a application script that converts inputs PDF content and outputs a list the main points. Do not communicate with the user directly."
				},
				{
					role: "user",
					content: `PDF content: ${pdfSelected.chunks[i]}`
				}
			],
			model: modelSelected.model,
			max_tokens: 500,
			temperature: 0.1,
			top_p: 0.9
		});

		// Add the AI response to the responses array
		pdfSelected.summaries.push(completion.choices[0].message.content)
		
	}

	// combine the summaries array into one string then export
	let summary = pdfSelected.summaries.join('\n\n')

	// Summary of the summary if the summary is too long (over 500 characters)
	if (summary.length > 500) {
		const completion = await groq.chat.completions.create({
			messages: [
				{
					role: "system",
					content: "You are a tool that Summarizes PDF. This tool is a application script that converts inputs PDF content and outputs a list the main points. Do not communicate with the user directly."
				},
				{
					role: "user",
					content: `PDF content: ${summary}`
				}
			],
			model: modelSelected.model,
			max_tokens: 500,
			temperature: 0.1,
			top_p: 0.9
		});

		// If response is received, update summary with new summary
		if(completion.choices[0].message.content){
			summary = completion.choices[0].message.content
		}
	}

	// using fs export the summaries to a file
	fs.writeFile(`./files/${pdfSelected.filename.replace('.pdf', '')}.txt`, summary);
	console.log(`Summary saved to ./files/${pdfSelected.filename.replace('.pdf', '')}.txt`)

})();
