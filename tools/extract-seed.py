"""Convert the archived SQLite seed into browser data without changing the source."""
import json
import copy
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = root / 'old-source/TheQuizLizard/quizlizard1.sqlite'
db = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
quizzes = []
for set_id, name in db.execute('SELECT SetId, Name FROM [Set] ORDER BY SetId'):
    cards = [dict(id=f'legacy-card-{row[0]}', question=row[1] or '', answer=row[2] or '',
                  notes=row[3] or '', wrongAnswers=[])
             for row in db.execute('SELECT WordId, Word1, Word2, [Desc] FROM WordList WHERE SetId=? ORDER BY WordId', (set_id,))]
    quizzes.append(dict(id=f'legacy-set-{set_id}', name=name, description='Original collection, 2011', cards=cards))
db.close()

updates = {
    'legacy-set-4': json.loads((root / 'data/state-capitals-update.json').read_text(encoding='utf-8')),
    'legacy-set-9': json.loads((root / 'data/world-capitals-update.json').read_text(encoding='utf-8')),
}
previous = []
for quiz in quizzes:
    quiz['revision'] = 1
    if quiz['id'] not in updates:
        continue
    update = updates[quiz['id']]
    previous.append(copy.deepcopy(quiz))
    quiz.update({key: update[key] for key in ('revision', 'description', 'updateNotes')})
    for card in quiz['cards']:
        card['wrongAnswers'] = update['wrongAnswers'].get(card['id'], update['wrongAnswers'].get(card['question']))
        card.update(update.get('cardOverrides', {}).get(card['id'], {}))
        assert len(card['wrongAnswers']) == 3
        assert len(set(value.casefold() for value in [card['answer'], *card['wrongAnswers']])) == 4
target = root / 'seed.js'
credit = '// World city alternatives adapted from GeoNames (https://www.geonames.org/), CC BY 4.0\n// (https://creativecommons.org/licenses/by/4.0/). Curated selections; see data/world-capitals-update.json.\n'
target.write_text(credit + 'window.QUIZ_SEED = ' + json.dumps(quizzes, ensure_ascii=True, indent=2) + ';\n', encoding='utf-8')
with target.open('a', encoding='utf-8') as output:
    output.write('window.QUIZ_SEED_PREVIOUS = ' + json.dumps(previous, ensure_ascii=True, indent=2) + ';\n')
print(f'Extracted {len(quizzes)} quizzes and {sum(len(q["cards"]) for q in quizzes)} linked cards.')
