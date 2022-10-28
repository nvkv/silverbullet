import { Manifest, RuntimeEnvironment } from "./types.ts";
import { Sandbox } from "./sandbox.ts";
import { System } from "./system.ts";
import { AssetBundle, AssetJson } from "./asset_bundle/bundle.ts";

export class Plug<HookT> {
  system: System<HookT>;
  sandbox: Sandbox;
  public manifest?: Manifest<HookT>;
  public assets?: AssetBundle;
  readonly runtimeEnv: RuntimeEnvironment;
  grantedPermissions: string[] = [];
  name: string;
  version: number;

  constructor(
    system: System<HookT>,
    name: string,
    sandboxFactory: (plug: Plug<HookT>) => Sandbox,
  ) {
    this.system = system;
    this.name = name;
    this.sandbox = sandboxFactory(this);
    this.runtimeEnv = system.runtimeEnv;
    this.version = new Date().getTime();
  }

  async load(manifest: Manifest<HookT>) {
    this.manifest = manifest;
    this.assets = new AssetBundle(
      manifest.assets ? manifest.assets as AssetJson : {},
    );
    // TODO: These need to be explicitly granted, not just taken
    this.grantedPermissions = manifest.requiredPermissions || [];
    for (const [dep, code] of Object.entries(manifest.dependencies || {})) {
      await this.sandbox.loadDependency(dep, code);
    }
  }

  syscall(name: string, args: any[]): Promise<any> {
    return this.system.syscallWithContext({ plug: this }, name, args);
  }

  canInvoke(name: string) {
    if (!this.manifest) {
      return false;
    }
    const funDef = this.manifest.functions[name];
    if (!funDef) {
      throw new Error(`Function ${name} not found in manifest`);
    }
    return !funDef.env || funDef.env === this.runtimeEnv;
  }

  async invoke(name: string, args: any[]): Promise<any> {
    const funDef = this.manifest!.functions[name];
    if (!funDef) {
      throw new Error(`Function ${name} not found in manifest`);
    }
    if (funDef.redirect) {
      // Function redirect, look up
      // deno-lint-ignore no-this-alias
      let plug: Plug<HookT> | undefined = this;
      if (funDef.redirect.indexOf(".") !== -1) {
        const [plugName, functionName] = funDef.redirect.split(".");
        plug = this.system.loadedPlugs.get(plugName);
        if (!plug) {
          throw Error(`Plug ${plugName} redirected to not found`);
        }
        name = functionName;
      } else {
        name = funDef.redirect;
      }
      return plug.invoke(name, args);
    }
    if (!this.sandbox.isLoaded(name)) {
      if (!this.canInvoke(name)) {
        throw new Error(
          `Function ${name} is not available in ${this.runtimeEnv}`,
        );
      }
      await this.sandbox.load(name, funDef.code!);
    }
    return await this.sandbox.invoke(name, args);
  }

  stop() {
    this.sandbox.stop();
  }
}