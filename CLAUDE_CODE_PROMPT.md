I have a folder at C:\Users\brick\Code\riff-machine that contains:
- riff-machine-repo.tar.gz (the source)
- riff-machine.jsx (a loose artifact file, not needed)
- riff-machine-repo/ (already extracted subfolder with the actual project)

I also have an empty GitHub repo already created at: https://github.com/MY_USERNAME/riff-machine.git

Please do the following:

1. Move all files from riff-machine-repo/ up into the parent riff-machine/ folder (so package.json, app/, components/, lib/, CLAUDE.md, README.md, etc. are at the top level of riff-machine/)
2. Delete the now-empty riff-machine-repo/ subfolder
3. Delete riff-machine-repo.tar.gz and the loose riff-machine.jsx — they're not needed
4. Make sure .gitignore is present at the root
5. Run: git init
6. Run: git add .
7. Run: git commit -m "init: riff machine"
8. Run: git branch -M main
9. Run: git remote add origin https://github.com/MY_USERNAME/riff-machine.git
10. Run: git push -u origin main --force
11. Run: npm install
12. Confirm it builds with: npm run build

Replace MY_USERNAME with my actual GitHub username. If the remote already exists, skip step 9.
