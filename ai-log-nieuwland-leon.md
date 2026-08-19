# AI-logboek

## 2026-09-15

### Taak

Databasemodel maken voor activiteiten.

### Prompt

Maak een Entity Framework model voor een activiteit met datum, starttijd, eindtijd, locatie en beschrijving.

### Outputsamenvatting

Copilot genereerde een C# modelklasse.

### Kritische beoordeling

De gegenereerde klasse werkte grotendeels correct.
Validatie voor verplichte velden ontbrak.
Daarnaast was de locatie optioneel terwijl dit volgens de requirements niet wenselijk was.

### Eigen aanpassingen

- Required-attributen toegevoegd.
- Maximale veldlengtes ingesteld.
- Commentaar toegevoegd.

### Resultaat

Werkend databasemodel opgenomen in de applicatie.