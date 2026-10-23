import "../client-global-error-guard/client-global-error-guard.js";
import "./client-native-style.css";
import { installNativeShell } from "./client-native-shell.js";

installNativeShell();
void import("../main.js");
