import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

/**
 * Vite plugin that provides a local endpoint for writing context files to disk.
 * This allows the browser app to export context data that Claude Code can read.
 *
 * Endpoint: POST /__claude-context
 * Body: { filename: string, content: object }
 * Writes to: /docs/claude-context/
 */
function claudeContextPlugin() {
  const contextDir = path.resolve(process.cwd(), 'docs/claude-context')

  return {
    name: 'claude-context-writer',
    configureServer(server) {
      server.middlewares.use('/__claude-context', async (req, res) => {
        if (req.method === 'POST') {
          let body = ''
          req.on('data', chunk => { body += chunk.toString() })
          req.on('end', async () => {
            try {
              const { filename, content } = JSON.parse(body)

              // Ensure context directory exists
              if (!fs.existsSync(contextDir)) {
                fs.mkdirSync(contextDir, { recursive: true })
              }

              // Write the file
              const filePath = path.join(contextDir, filename)
              fs.writeFileSync(filePath, JSON.stringify(content, null, 2))

              console.log(`📝 Context exported: ${filename}`)

              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: true, path: filePath }))
            } catch (error) {
              console.error('❌ Context export error:', error)
              res.writeHead(500, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ success: false, error: error.message }))
            }
          })
        } else if (req.method === 'DELETE') {
          // Clear all context files
          try {
            if (fs.existsSync(contextDir)) {
              const files = fs.readdirSync(contextDir)
              files.forEach(file => {
                fs.unlinkSync(path.join(contextDir, file))
              })
              console.log('🗑️ Context files cleared')
            }
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: false, error: error.message }))
          }
        } else {
          res.writeHead(405)
          res.end('Method not allowed')
        }
      })
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), claudeContextPlugin()],

  build: {
    rollupOptions: {
      output: {
        // Without this everything landed in one 1,154 kB entry chunk, dominated
        // by Firebase. Splitting the big third-party clusters out means they
        // cache independently of app code, so a change to a page no longer
        // invalidates the whole vendor payload.
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          d3: ['d3'],
          // @tiptap/pm is deliberately absent: it exposes no root export, only
          // subpaths, so naming it here fails to resolve. Its subpaths get
          // pulled in alongside these anyway.
          tiptap: [
            '@tiptap/react',
            '@tiptap/starter-kit',
            '@tiptap/extension-placeholder',
            '@tiptap/extension-character-count'
          ],
          vendor: ['react', 'react-dom', 'react-router-dom', 'framer-motion']
        }
      }
    }
  }
})
