"""Convert the archived SQLite seed into browser data without changing the source."""
import json
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
target = root / 'seed.js'
target.write_text('window.QUIZ_SEED = ' + json.dumps(quizzes, ensure_ascii=True, indent=2) + ';\n', encoding='utf-8')
print(f'Extracted {len(quizzes)} quizzes and {sum(len(q["cards"]) for q in quizzes)} linked cards.')
