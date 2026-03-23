import { defineConfig } from "vite";
import http from "node:http";

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            console.log(`[proxy] ${req.method} ${req.url} → ${proxyReq.path}`);
          });
        },
      },
      // Same-origin avatar images when API stores http://localhost:3000/uploads/...
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
