"""Stamp a release version into the footer and all local HTML/CSS asset URLs."""
import argparse
from datetime import datetime
from html import escape, unescape
from pathlib import Path
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit


def stamp(directory, version):
    if not re.fullmatch(r'v\d{8}-\d{4}', version):
        raise ValueError('Use a version such as v20260826-1747.')
    datetime.strptime(version, 'v%Y%m%d-%H%M')
    directory = directory.resolve()

    def asset_url(url, parent):
        parts = urlsplit(url)
        if parts.scheme or parts.netloc or not parts.path:
            return url
        target = (parent / parts.path).resolve()
        if not target.is_relative_to(directory) or not target.is_file():
            return url
        query = [(key, value) for key, value in parse_qsl(parts.query) if key != 'v']
        query.append(('v', version))
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

    index = directory / 'index.html'
    page = index.read_text(encoding='utf-8')
    page, meta_count = re.subn(r'(<meta name="app-version" content=")[^"]*(">)',
                               lambda m: m[1] + version + m[2], page)
    page, footer_count = re.subn(r'(<span id="app-version">)[^<]*(</span>)',
                                 lambda m: m[1] + version + m[2], page)
    if meta_count != 1 or footer_count != 1:
        raise ValueError('Expected one app-version meta tag and footer label.')
    stylesheets = set()
    for url in re.findall(r'(?:src|href)="([^"]+)"', page):
        parts = urlsplit(unescape(url))
        if parts.scheme or parts.netloc or not parts.path.endswith('.css'):
            continue
        css = (directory / parts.path).resolve()
        if css.is_relative_to(directory) and css.is_file():
            stylesheets.add(css)
    page = re.sub(r'((?:src|href)=")([^"]+)(")',
                  lambda m: m[1] + escape(asset_url(unescape(m[2]), directory), quote=True) + m[3], page)
    index.write_text(page, encoding='utf-8')
    for css in stylesheets:
        # CSS-only references need the same version as HTML and runtime images.
        text = css.read_text(encoding='utf-8')
        updated = re.sub(r'url\(\s*([\'\"]?)([^)\'\"\s]+)\1\s*\)',
                         lambda m: f'url({m[1]}{asset_url(m[2], css.parent)}{m[1]})', text)
        if updated != text:
            css.write_text(updated, encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--directory', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--version', required=True)
    args = parser.parse_args()
    stamp(args.directory, args.version)
    print(f'Stamped {args.version} into {args.directory}.')
