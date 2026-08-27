import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root:"pages",
  base:"/Archive-Fow/",
  plugins:[react()],
  publicDir:"../public",
  build:{outDir:"../pages-dist",emptyOutDir:true},
});
