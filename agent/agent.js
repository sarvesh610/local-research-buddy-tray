import { tools } from './tools.js';
import OpenAI from 'openai';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

const SYSTEM = `You are a helpful local Agent.
Output exactly one line of JSON to call a tool:
{"tool":"<name>","args":{...}}
or finish with:
FINAL: <answer>
Never invent tool results. Keep answers concise. Stop when done.`;

// Simple OpenAI wrapper for agent use
async function chatOnce({ messages, onToken }) {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const client = new OpenAI({ apiKey: OPENAI_API_KEY });
  
  const resp = await client.chat.completions.create({
    model: OPENAI_MODEL,
    messages,
    temperature: 0.2,
    stream: !!onToken
  });

  if (onToken) {
    // Handle streaming
    let fullText = "";
    for await (const chunk of resp) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) {
        fullText += delta;
        onToken(delta);
      }
    }
    return { text: fullText };
  } else {
    // Handle non-streaming
    return { text: resp.choices?.[0]?.message?.content || "" };
  }
}

export async function runAgent({ messages, maxSteps = 6, onToken }) {
  console.log('[agent] Starting agent with', messages.length, 'initial messages');
  
  const toolDescriptions = Object.entries(tools)
    .map(([k, t]) => `- ${k}: ${t.desc} args=${JSON.stringify(t.schema)}`)
    .join("\n");

  const history = [
    { 
      role: 'system', 
      content: SYSTEM + "\n\nAvailable tools:\n" + toolDescriptions 
    },
    ...messages
  ];

  for (let i = 0; i < maxSteps; i++) {
    console.log(`[agent] Step ${i + 1}/${maxSteps}`);
    
    try {
      const { text } = await chatOnce({ messages: history, onToken });
      const out = (text || "").trim();
      
      console.log(`[agent] LLM response:`, out.substring(0, 200));

      if (out.startsWith("FINAL:")) {
        const finalAnswer = out.replace(/^FINAL:\s*/, "");
        console.log(`[agent] Completed in ${i + 1} steps`);
        return { 
          ok: true, 
          final: finalAnswer, 
          steps: i + 1 
        };
      }

      // Try to parse the last JSON line
      let call;
      try {
        const jsonLine = out.split("\n")
          .reverse()
          .find(l => l.trim().startsWith("{"));
        
        if (!jsonLine) {
          throw new Error("No JSON line found");
        }
        
        call = JSON.parse(jsonLine);
        console.log(`[agent] Parsed tool call:`, call);
      } catch (parseError) {
        console.log(`[agent] Failed to parse JSON, asking for clarification`);
        history.push({ role: 'assistant', content: out });
        history.push({ 
          role: 'user', 
          content: "Please provide a valid tool JSON or a FINAL answer." 
        });
        continue;
      }

      const tool = tools[call.tool];
      if (!tool) {
        console.log(`[agent] Unknown tool: ${call.tool}`);
        history.push({ role: 'assistant', content: out });
        history.push({ 
          role: 'user', 
          content: `Tool "${call.tool}" not found. Available tools: ${Object.keys(tools).join(", ")}` 
        });
        continue;
      }

      // Execute the tool
      try {
        console.log(`[agent] Executing ${call.tool} with args:`, call.args);
        const result = await tool.run(call.args || {});
        console.log(`[agent] Tool ${call.tool} succeeded:`, Object.keys(result));
        
        history.push({ role: 'assistant', content: out });
        history.push({ 
          role: 'user', 
          content: `OBSERVATION (${call.tool}): ${JSON.stringify(result).slice(0, 4000)}` 
        });
      } catch (toolError) {
        console.error(`[agent] Tool ${call.tool} failed:`, toolError.message);
        history.push({ role: 'assistant', content: out });
        history.push({ 
          role: 'user', 
          content: `OBSERVATION (${call.tool}) ERROR: ${toolError.message}` 
        });
      }
    } catch (llmError) {
      console.error(`[agent] LLM call failed:`, llmError);
      return { 
        ok: false, 
        final: `LLM error: ${llmError.message}`, 
        steps: i + 1 
      };
    }
  }

  console.log(`[agent] Reached step limit of ${maxSteps}`);
  return { 
    ok: false, 
    final: "Step limit reached without FINAL.", 
    steps: maxSteps 
  };
}