"""Verify curated alternatives against a downloaded Census National Places ZIP."""
import csv
import io
import json
import sys
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
update = json.loads((root / 'data/state-capitals-update.json').read_text(encoding='utf-8'))
states = ('Alabama AL,Alaska AK,Arizona AZ,Arkansas AR,California CA,Colorado CO,'
          'Connecticut CT,Delaware DE,Florida FL,Georgia GA,Hawaii HI,Idaho ID,'
          'Illinois IL,Indiana IN,Iowa IA,Kansas KS,Kentucky KY,Louisiana LA,'
          'Maine ME,Maryland MD,Massachusetts MA,Michigan MI,Minnesota MN,'
          'Mississippi MS,Missouri MO,Montana MT,Nebraska NE,Nevada NV,'
          'New Hampshire NH,New Jersey NJ,New Mexico NM,New York NY,'
          'North Carolina NC,North Dakota ND,Ohio OH,Oklahoma OK,Oregon OR,'
          'Pennsylvania PA,Rhode Island RI,South Carolina SC,South Dakota SD,'
          'Tennessee TN,Texas TX,Utah UT,Vermont VT,Virginia VA,Washington WA,'
          'West Virginia WV,Wisconsin WI,Wyoming WY')
abbreviations = dict(s.rsplit(' ', 1) for s in states.split(','))
with zipfile.ZipFile(sys.argv[1]) as archive:
    text = archive.read(next(n for n in archive.namelist() if n.endswith('.txt'))).decode('utf-8-sig')
    delimiter = '|' if '|' in text.splitlines()[0] else '\t'
    rows = list(csv.DictReader(io.StringIO(text), delimiter=delimiter))
assert set(update['wrongAnswers']) == set(abbreviations)
for state, cities in update['wrongAnswers'].items():
    assert len(set(cities)) == 3
    for city in cities:
        # Census appends city/CDP/consolidated-government qualifiers to names.
        assert any(r['USPS'] == abbreviations[state] and
                   (r['NAME'].startswith(city + ' ') or r['NAME'].startswith(city + '-'))
                   for r in rows), f'{city} not found in {state}'
print('Verified all 150 alternatives against Census place names in their states.')
