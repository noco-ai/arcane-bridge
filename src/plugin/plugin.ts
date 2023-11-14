type PluginType = (context: any, next: () => void) => void;

export interface PluginMethod {
  (...args: any[]): any;
  use?(plugin: PluginType): void;
}

export function PluginSystem(
  target: Object,
  propertyKey: string | symbol,
  descriptor: TypedPropertyDescriptor<PluginMethod>
) {
  const originalMethod = descriptor.value!; // save a reference to the original method
  let plugins: PluginType[] = [];

  // The function we are going to replace originalMethod with
  function pluginMethod(this: any, ...args: any[]): any {
    let context = {
      target: this,
      args,
      propertyKey,
    };

    let i = -1;

    function next() {
      i++;
      if (i >= plugins.length) {
        return originalMethod.apply(context.target, context.args);
      }
      const plugin = plugins[i];
      return plugin(context, next);
    }

    return next();
  }

  pluginMethod.use = (plugin: PluginType) => {
    plugins.push(plugin);
  };

  descriptor.value = pluginMethod;
  return descriptor;
}
