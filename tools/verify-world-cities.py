"""Verify curated world choices against a downloaded GeoNames cities500 ZIP."""
import argparse
import json
import unicodedata
import zipfile
from pathlib import Path


def normalize(value):
    return ''.join(ch for ch in unicodedata.normalize('NFKD', value).casefold()
                   if ch.isalnum() and not unicodedata.combining(ch))


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('zip', type=Path)
args = parser.parse_args()
data = json.loads((Path(__file__).resolve().parents[1] / 'data/world-capitals-update.json').read_text(encoding='utf-8'))
with zipfile.ZipFile(args.zip) as archive:
    records = {int(row[0]): row for line in archive.read('cities500.txt').decode('utf-8').splitlines()
               if (row := line.split('\t'))}
count = 0
for card_id, proof in data['verification'].items():
    assert [p['name'] for p in proof['places']] == data['wrongAnswers'][card_id]
    assert len({p['geonameId'] for p in proof['places']}) == 3
    for place in proof['places']:
        row = records[place['geonameId']]
        assert row[8] == place['countryCode'], place
        assert row[6] == 'P', place
        assert normalize(place['name']) in {normalize(n) for n in [row[1], row[2], *row[3].split(',')]}, place
        if proof['countryCode'] not in {'MC', 'SG', 'VA'}:
            assert place['countryCode'] == proof['countryCode'], place
        count += 1
print(f'Verified {count} alternatives for {len(data["verification"])} world questions.')
