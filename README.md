# Sterkfontein Dataset — Project Webpage

Source for the Sterkfontein dataset project page, hosted under the Brown Visual
Computing site at **https://visual.cs.brown.edu/sterkfontein**.

This repo is intended to be included as a Git submodule of
[`brownvc/vcwebpage.github.io`](https://github.com/brownvc/vcwebpage.github.io)
under `projects/`, and is pulled into GitHub Pages on build.

## How it works

- `index.html` carries Jekyll frontmatter that sets the short URL:
  ```
  ---
  redirect_from: sterkfontein/
  ---
  ```
  So `visual.cs.brown.edu/sterkfontein` resolves to this page. Make sure no other
  project uses the same `redirect_from` short URL.
- The page is self-contained (inline CSS, relative asset paths). Put images in
  `./images` and videos in `./videos`.

## Local preview

The simplest check is to open `index.html` in a browser (the frontmatter `---`
lines show as text but the rest renders). For a faithful preview matching the
live site, run Jekyll from the parent `vcwebpage.github.io` checkout:

```
jekyll serve --watch
```

then visit http://localhost:4000/sterkfontein.

## Adding this page to the live site (Daniel or James)

1. Make this repo public on `github.com/brownvc`.
2. From the `vcwebpage.github.io` root:
   ```
   cd projects
   git submodule add https://github.com/brownvc/sterkfontein-webpage
   ```
   (Use **https** as the access protocol.)
3. Commit and push the parent repo.

## Updating after changes

After pushing changes here, the submodule pointer in the parent repo must be
bumped and Pages rebuilt:

```
git submodule update --remote --merge   # in projects/sterkfontein-webpage
git add projects/sterkfontein-webpage
git commit -m "Update sterkfontein-webpage submodule"
git push
```

## TODO

The current `index.html` is a placeholder scaffold. Fill in:
- [ ] Title / tagline and author list + affiliation logos
- [ ] Paper / code / dataset download links
- [ ] Teaser image or video
- [ ] Overview, dataset details, format, license
- [ ] BibTeX citation
- [ ] Acknowledgements
