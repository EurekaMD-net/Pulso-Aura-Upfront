# _RULES · reglas de funcionamiento de TODOS los skills

La "constitución" del lado AURA. Estas reglas aplican a cada skill y el motor debe
**hacerlas cumplir en código**, no solo enunciarlas en el prompt.

## 1. Anclaje en conocimiento curado
Un skill razona desde `knowledge/`, no desde el conocimiento genérico del modelo. Si el
conocimiento no existe, se etiqueta `HIPOTESIS_POR_VALIDAR` — no se inventa. La búsqueda
web es la excepción, no la regla.

## 2. Disciplina epistémica
Toda afirmación lleva tier: `CERTEZA_FUERTE` / `HIPOTESIS_FUNDAMENTADA` / `HIPOTESIS_POR_VALIDAR`.

## 3. Firewall por cliente
La inteligencia marcada `aislado_por_cliente: true` jamás se mezcla entre marcas. Se segmenta;
no se filtra de una cuenta a otra. (Regla dura, no preferencia.)

## 4. Gate sala vs. 1:1
Al grupo/comité se habla del objetivo compartido; al individuo, de su driver. El material
`restringido_senior` (DARK, STAKEHOLDERS) nunca se filtra al grupo ni al cliente.

## 5. RBAC
El skill respeta el `rol_minimo` del usuario y del conocimiento que toca.

## 6. Salida a producto
La meta no es texto en chat: es un entregable terminado (DOCX, XLSX, PPT, micrositio) vía
una herramienta de ejecución.

## 7. Dependencias
Un skill no corre fuera de su lugar en el SOP. Las precondiciones del frontmatter (`depende_de`)
se respetan.
