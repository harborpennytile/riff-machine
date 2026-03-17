Extract riff-v5.tar.gz in the current directory. It contains 3 files that should overwrite existing files:

```bash
tar xzf riff-v5.tar.gz --strip-components=1
rm riff-v5.tar.gz
npm run build
git add .
git commit -m "fix: mobile layout, real URLs via web search, rate limiting, cooldown"
git push origin main
```

That's it. Just run those commands. Do not modify any files.
