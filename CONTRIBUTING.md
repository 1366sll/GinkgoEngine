# Contributing to Ginkgo Engine

Thanks for your interest in contributing! 🍂

Ginkgo Engine is an open-source Web Galgame engine. We welcome contributions of all kinds — bug reports, feature ideas, documentation, translations, and code.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/GinkgoEngine.git
   cd GinkgoEngine
   ```
3. Start the dev server:
   ```bash
   node server.js
   ```
4. Open `http://localhost:3000` (player), `/editor.html` (editor), `/epilogue.html` (AI chat)

## How to Contribute

### Reporting Bugs

- Search [existing issues](https://github.com/YOUR_USERNAME/GinkgoEngine/issues) first
- Include browser + OS version
- Describe steps to reproduce
- Attach console error logs if applicable

### Suggesting Features

- Open a feature request issue
- Describe the use case — who wants this and why?
- If possible, sketch how the feature would fit into the existing scene JSON format or editor UI

### Code Contributions

1. Create a feature branch: `git checkout -b feature/my-feature`
2. Keep changes focused — one feature/fix per PR
3. Match the existing code style (2-space indentation, ES6+)
4. Test in at least Chrome and Firefox
5. Open a Pull Request with a clear description

### Project Structure

```
GinkgoEngine/
├── index.html          # Game player
├── editor.html         # Visual scenario editor
├── epilogue.html       # AI post-game chat
├── server.js           # Dev server (Node.js)
├── sw.js               # PWA Service Worker
├── css/                # Stylesheets
├── js/                 # Engine core + editor + epilogue modules
├── live2d/             # Live2D Cubism SDK + models
├── assets/             # Game asset directories
└── characters/         # AI character prompt templates
```

## Code Style

- **Indentation:** 4 spaces
- **Quotes:** Single quotes preferred
- **Semicolons:** Yes
- **Comments:** Chinese is fine for domain-specific comments; use English for API-facing JSDoc

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).

---

**Questions?** Open an issue or start a discussion!
