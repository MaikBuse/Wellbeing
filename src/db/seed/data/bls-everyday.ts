/**
 * The everyday shortlist: the BLS entries a food diary reaches for daily.
 *
 * The catalog holds 7140 foods and the BLS enumerates every preparation of
 * each one — "Apfel roh", "Apfel geschält, roh", "Apfel gedünstet", "Apfel
 * Konserve, abgetropft". Without a shortlist the picker answers "apfel" with a
 * dozen equally-ranked variants and is worse than typing the food by hand, so
 * `searchCatalog` sorts these first (see src/db/queries/foods.ts).
 *
 * It is a ranking hint and nothing else: everything not listed here stays
 * searchable and reachable. Adding or removing a code needs no migration, only
 * a re-seed, so treat this as a list to tune rather than to get right.
 *
 * Codes, not names, because a name is not stable across BLS releases and a
 * typo in one would fail silently. `db:check` asserts every code resolves.
 */
export const BLS_EVERYDAY_CODES: readonly string[] = [
  // --- Brot ---
  'B111000', // Weizenvollkornbrot
  'B121000', // Roggenvollkornbrot
  'B251000', // Weizenmischbrot
  'B271000', // Roggenmischbrot
  'B511000', // Weizenbrötchen
  'B6A6000', // Knäckebrot glutenfrei, laktosefrei
  'B780500', // Pumpernickel
  'B8A1000', // Baguette glutenfrei
  'B8A8000', // Toastbrot glutenfrei
  // --- Getreide, Flocken, Mehl ---
  'C118000', // Quinoa weiß, roh
  'C119100', // Bulgur (Hartweizen) roh
  'C119132', // Bulgur (Hartweizen) gekocht
  'C119200', // Couscous (Hartweizen) roh
  'C119232', // Couscous (Hartweizen) gekocht
  'C133000', // Hafer Flocken
  'C133032', // Hafer Flocken, gekocht
  'C211000', // Weizen Vollkornmehl
  'C213200', // Weizen Mehl, Type 1050
  'C214100', // Weizen Mehl, Type 405
  'C236000', // Dinkel ganzes Korn, roh
  'C322000', // Buchweizen roh
  'C332000', // Hirse roh
  'C351000', // Reis unpoliert, roh
  'C351032', // Reis unpoliert, gekocht
  'C352000', // Reis poliert, roh
  'C352032', // Reis poliert, gekocht
  'C514200', // Knuspermüslimischung, klassisch, gesüßt
  'C515000', // Cornflakes gesüßt
  'C660000', // Haferdrink ungesüßt
  // --- Backwaren ---
  'D038000', // Zwieback eifrei
  // --- Teigwaren und Ei ---
  'E111100', // Hühnerei roh
  'E111132', // Hühnerei gekocht
  'E401000', // Teigwaren eifrei, roh
  'E401032', // Teigwaren eifrei, gekocht
  'E432000', // Eierteigwaren roh
  'E500032', // Vollkornteigwaren eifrei, gekocht
  'E510000', // Vollkornteigwaren eifrei, roh
  'E606000', // Semmelknödel roh
  // --- Obst ---
  'F110100', // Apfel roh
  'F110600', // Apfelsaft
  'F130100', // Birne roh
  'F201100', // Aprikose roh
  'F202100', // Nektarine roh
  'F203100', // Pfirsich roh
  'F211100', // Süßkirsche roh
  'F220100', // Pflaume roh
  'F301100', // Erdbeere roh
  'F302100', // Himbeere roh
  'F303100', // Brombeere roh
  'F304100', // Heidelbeere roh
  'F305100', // Stachelbeere roh
  'F310100', // Weintraube roh
  'F321100', // Johannisbeere rot, roh
  'F501100', // Ananas roh
  'F502100', // Avocado roh
  'F503100', // Banane roh
  'F504100', // Dattel roh
  'F505100', // Feige roh
  'F514100', // Kiwi roh
  'F516100', // Mango roh
  'F535100', // Wassermelone roh
  'F601100', // Zitrone roh
  'F603100', // Orange roh
  'F603600', // Orangensaft
  'F604100', // Grapefruit roh
  'F606100', // Mandarine roh
  'F840100', // Rosine/Sultanine (Weinbeere getrocknet)
  // --- Gemüse ---
  'G101100', // Chicoree roh
  'G103100', // Eisbergsalat roh
  'G104100', // Feldsalat/Rapunzel, roh
  'G105100', // Kopfsalat roh
  'G130100', // Rucola roh
  'G210132', // Spinat gekocht
  'G211100', // Spinat roh
  'G220100', // Bleichsellerie roh
  'G311100', // Blumenkohl roh
  'G311132', // Blumenkohl gekocht
  'G312100', // Broccoli roh
  'G312132', // Broccoli gekocht
  'G321100', // Chinakohl roh
  'G322100', // Grünkohl roh
  'G331100', // Kohlrabi roh
  'G331132', // Kohlrabi gekocht
  'G332100', // Rosenkohl roh
  'G341100', // Rotkohl roh
  'G342100', // Weißkohl roh
  'G345100', // Sauerkraut abgetropft, roh
  'G431100', // Fenchelblatt/Bologneser Fenchel, roh
  'G450100', // Spargel roh
  'G450132', // Spargel gekocht
  'G470100', // Porree/Lauch, roh
  'G480100', // Speisezwiebel roh
  'G485100', // Schalotte roh
  'G490100', // Knoblauch roh
  'G510100', // Aubergine roh
  'G520100', // Gurke roh
  'G543100', // Gemüsepaprika rot, roh
  'G561100', // Tomate roh
  'G570100', // Zuckermais roh
  'G581100', // Kürbis Pumpkin (C. pepo) roh
  'G582100', // Zucchini roh
  'G582132', // Zucchini gekocht
  'G613100', // Rote Rübe/Rote Bete, roh
  'G620100', // Karotte/Möhre, roh
  'G660100', // Knollensellerie roh
  'G680100', // Rettich roh
  'G691100', // Radieschen roh
  'G710100', // Bohne grün, roh
  'G710132', // Bohne grün, gekocht
  'G760100', // Erbse grün, roh
  'G760132', // Erbse grün, gekocht
  // --- Hülsenfrüchte, Nüsse, Samen ---
  'H110600', // Erdnuss geröstet
  'H110800', // Erdnussmus
  'H120100', // Walnuss
  'H130100', // Haselnuss
  'H170100', // Cashewkern
  'H210100', // Mandel süß
  'H212800', // Mandelmus
  'H250100', // Pistazie
  'H310100', // Kürbiskern
  'H410100', // Leinsamen
  'H420100', // Sesam
  'H430100', // Sonnenblumenkern
  'H480100', // Chia-Samen
  'H520800', // Oliven geschwärzt, in Salzlake, abgetropft
  'H620100', // Sojabohnensprossen/Sojabohnenkeimlinge, roh
  'H720902', // Kichererbse reif, Konserve, abgetropft
  'H730032', // Linse rot, reif, gekocht
  'H730132', // Linse reif, gekocht
  'H742100', // Kidneybohne reif
  'H742132', // Kidneybohne reif, gekocht
  'H800000', // Mandeldrink ungesüßt
  'H841100', // Sojadrink ungesüßt
  'H861000', // Tofu
  // --- Kartoffeln und Pilze ---
  'K110100', // Kartoffel geschält, roh
  'K110132', // Kartoffel geschält, gekocht
  'K130200', // Pommes frites tiefgefroren
  'K420100', // Batate/Süßkartoffel, roh
  'K701100', // Champignon roh
  'K701132', // Champignon gekocht
  'K713100', // Pfifferling roh
  'K718100', // Steinpilz roh
  // --- Milch, Käse, Quark ---
  'M012200', // Feta mind. 45 % Fett i. Tr.
  'M032100', // Mozzarella mind. 45 % Fett i. Tr.
  'M111200', // Milch fettarm, frisch, 1,5 % Fett, pasteurisiert
  'M111300', // Vollmilch frisch, 3,5 % Fett, pasteurisiert
  'M113300', // H-Vollmilch 3,5 % Fett, ultrahocherhitzt
  'M130300', // Kefir mind. 3,5 % Fett
  'M141200', // Joghurt fettarm, mind. 1,5 % bis max. 1,8 % Fett
  'M148300', // Joghurt mind. 3,5 % Fett, mit Magermilchpulverzusatz
  'M150000', // Buttermilch
  'M172500', // Sauerrahm/Saure Sahne, mind. 10 % Fett
  'M172700', // Sauerrahm/Schmand, mind. 20 % Fett
  'M176800', // Sauerrahm/Creme fraiche, 30 % Fett
  'M304600', // Emmentaler mind. 45 % Fett i. Tr.
  'M306400', // Parmesan mind. 30 % Fett i. Tr.
  'M400600', // Schnittkäse mind. 45 % Fett i. Tr.
  'M402600', // Gouda 48 % Fett i. Tr.
  'M602600', // Camembert mind. 45 % Fett i. Tr.
  'M710100', // Skyr, Frischkäse < 10 % Fett i. Tr.
  'M711100', // Körniger Frischkäse < 10 % Fett i. Tr.
  'M713100', // Speisequark Magerstufe, Magerquark < 10 % Fett i. Tr.
  'M713300', // Speisequark Halbfettstufe, 20 % Fett i. Tr.
  'M820100', // Frischkäsezubereitung Natur < 10 % Fett i. Tr.
  // --- Alkoholfreie Getränke ---
  'N110000', // Trinkwasser
  'N256000', // Fruchtsaftschorle Apfel
  'N330000', // Colagetränk koffeinhaltig
  'N410100', // Kaffee (Getränk)
  'N411100', // Espresso (Getränk)
  'N610100', // Grüntee (Getränk)
  'N630000', // Schwarztee (Getränk)
  'N720100', // Kräutertee (Getränk)
  // --- Alkoholische Getränke ---
  'P163000', // Pilsner Bier
  'P210000', // Weißwein trocken
  'P2A3000', // Rotwein trocken
  // --- Fette und Öle ---
  'Q120000', // Olivenöl
  'Q160000', // Leinöl
  'Q180000', // Rapsöl/Rüböl
  'Q320000', // Sonnenblumenöl
  'Q400000', // Pflanzenmargarine Vollfett, angereichert mit Vitaminen
  'Q550000', // Kokosöl
  'Q611000', // Butter mild gesäuert
  'Q6A4000', // Butter gesalzen
  // --- Würzmittel ---
  'R114000', // Speisesalz jodiert/Jodsalz
  'R121000', // Weinessig
  'R123100', // Apfelessig
  'R132000', // Senf mittelscharf
  'R141100', // Tomatenketchup
  'R143000', // Sojasauce/Sojasoße
  'R148600', // Feinkostsauce/Grillsauce, Mayonnaise-Basis
  'R160000', // Tomatenmark
  // --- Zucker und Süßes ---
  'S111000', // Zucker weiß (Raffinadezucker/Weißzucker)
  'S112000', // Zucker braun (Kandisfarin/Rohzucker)
  'S120000', // Honig
  'S132000', // Konfitüre extra
  'S539900', // Vollmilchschokolade
  'S570000', // Bitterschokolade
  'S711000', // Kakaopulver schwach entölt
  // --- Fisch ---
  'T102100', // Hering roh
  'T107100', // Makrele roh
  'T121100', // Thunfisch roh
  'T204100', // Dorsch/Kabeljau, roh
  'T207100', // Köhler/Seelachs, roh
  'T305100', // Goldbutt/Scholle, roh
  'T410100', // Lachs roh
  'T422100', // Forelle roh
  'T753100', // Garnele/Granat/Krabbe, roh
  // --- Fleisch ---
  'U010100', // Rind Hackfleisch, roh
  'U020100', // Schwein Hackfleisch, roh
  'U211100', // Rind Filet/Lende, roh
  'U216100', // Rind Filetsteak roh
  'U221100', // Rind Roastbeef (Rücken) roh
  'U541100', // Schwein Schnitzel (Oberschale) roh
  'U543100', // Schwein Schnitzel (Nuss) roh
  'U611100', // Schwein Filet/Lende, roh
  'U624100', // Schwein Kotelett (Rücken/caudal) roh
  'U817100', // Lamm Nuss, roh
  // --- Geflügel und Kaninchen ---
  'V132100', // Kaninchen Fleisch, roh
  'V416100', // Hähnchen Brustfilet, roh
  'V416132', // Hähnchen Brustfilet, gekocht
  'V484100', // Pute Fleisch, mit Haut, roh
  'V486100', // Pute Brust, ohne Haut, roh
  'V4A6100', // Hähnchen Brust, ohne Haut, roh
  // --- Wurstwaren ---
  'W140000', // Salami
  'W211200', // Wiener Würstchen
  'W222100', // Bratwurst mittelgrob
  'W271000', // Bierschinken
  'W327000', // Leberwurst einfach
  'W331000', // Mettwurst gekocht
  'W424032', // Schwein Kochschinken, Kochpökelware, gekocht
];
