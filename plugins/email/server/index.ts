import { Hook, PluginManager } from "@server/utils/PluginManager";
import config from "../plugin.json";
import router from "./auth/email";

PluginManager.add({
  ...config,
  type: Hook.AuthProvider,
  value: { router, id: config.id },
});
