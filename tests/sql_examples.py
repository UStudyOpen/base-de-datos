"""Execute the corrected concrete SQLite DDL examples, using source blocks."""
from pathlib import Path
import sqlite3,re
source=(Path(__file__).resolve().parents[1]/'sql/ddl-dml.qmd').read_text()
blocks=re.findall(r'```sql\n(.*?)```',source,re.S)
con=sqlite3.connect(':memory:')
def block(prefix): return next(s for s in blocks if s.strip().startswith(prefix))
con.executescript(block('CREATE TABLE Estudiante'))
con.executescript(block('ALTER TABLE Estudiante'))
con.executescript(block('CREATE VIEW EstudiantesIngenieria'))
con.executescript(block('CREATE INDEX indice_nombre_estudiante'))
con.executescript(block('INSERT INTO Estudiante'))
assert con.execute('SELECT nombre FROM EstudiantesIngenieria').fetchall()==[('Ana Pérez',)]
try:
 con.executescript(block('INSERT INTO Estudiante'))
except sqlite3.IntegrityError: pass
else: raise AssertionError('Primary key did not reject repeated identifier')
con.executescript(block('UPDATE Estudiante'))
assert con.execute('SELECT carrera FROM Estudiante').fetchall()==[('Ciencia de Datos',)]
assert con.execute('SELECT * FROM EstudiantesIngenieria').fetchall()==[]
con.executescript(block('DELETE FROM Estudiante'))
assert con.execute('SELECT COUNT(*) FROM Estudiante').fetchone()==(0,)
con.executescript(block('DROP INDEX indice_nombre_estudiante'))
con.executescript(block('DROP VIEW EstudiantesIngenieria'))
print(f'SQLite {sqlite3.sqlite_version}: DDL, view, index, insert/update/delete and duplicate-PK rejection passed. MERGE/TRUNCATE are not SQLite examples and were not executed.')
