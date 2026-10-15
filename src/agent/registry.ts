import type { AgentContext, AgentTool, ToolCall, ToolDefinition } from './types';

/** Registration is the only way to grant an Agent a host capability. No eval or arbitrary HTTP. */
export class AgentToolRegistry {
  private tools = new Map<string, AgentTool>();

  register(tool: AgentTool): () => void {
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(tool.name) || this.tools.has(tool.name))
      throw new Error(`工具名称无效或重复：${tool.name}`);
    this.tools.set(tool.name, tool);
    return () => {
      if (this.tools.get(tool.name) === tool) this.tools.delete(tool.name);
    };
  }

  definitions(): ToolDefinition[] {
    return Array.from(this.tools.values(), ({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  async execute(call: ToolCall, context: AgentContext): Promise<unknown> {
    context.signal.throwIfAborted();
    const tool = this.tools.get(call.name);
    if (!tool) throw new Error(`未注册该能力：${call.name}`);
    const input: unknown = JSON.parse(call.arguments);
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('工具参数必须是 JSON 对象');
    const args = input as Record<string, unknown>;
    for (const name of tool.parameters.required)
      if (!(name in args)) throw new Error(`缺少参数：${name}`);
    for (const [name, value] of Object.entries(args)) {
      const property = tool.parameters.properties[name];
      if (!property || typeof value !== property.type) throw new Error(`参数类型不正确：${name}`);
      if (property.enum && !property.enum.includes(String(value)))
        throw new Error(`参数值不正确：${name}`);
    }
    return tool.execute(args, context);
  }
}
