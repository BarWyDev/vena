/// <reference types="vite-plugin-pwa/client" />

declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
  }
}
