# Vista SAFF/SIDCO — decisiones de diseño

Documento de trabajo del explorador nuevo. Registra **por qué** está hecho así, qué
objeciones se resolvieron y cuáles se aceptaron como limitación conocida.

## Método

El diseño no se eligió a ojo. Se generaron tres propuestas independientes desde tesis
distintas (orientada a la tarea del analista, orientada a la legibilidad espacial,
orientada al diccionario documental) y cada una fue atacada por tres críticos con lentes
distintas: **escala y densidad**, **coste de tarea y accesibilidad**, e
**implementabilidad y rendimiento**. Las objeciones tenían que citar datos reales del
esquema, no principios generales. De ahí salió una especificación de síntesis.

Lo que sigue es lo que sobrevivió a esa criba, con las cifras que lo sostienen.

## La tesis

El original **dibuja** el esquema pero no ayuda a **entenderlo**: 327 tarjetas idénticas
en una grilla de 10 columnas ordenada por grado, donde la posición no significa nada y el
encuadre automático deja el zoom en ~8%, con lo que no se lee ni un nombre.

Aquí la posición significa algo y el mapa es legible en su zoom por defecto.

## Decisiones y las objeciones que las produjeron

### 1. La posición codifica estructura, no orden alfabético

El grafo de claves foráneas **no es una sola pieza**. Medido: SAFF tiene 74 componentes
conexas (la mayor de 249 tablas, y 71 tablas totalmente aisladas); SIDCO tiene 27 (la
mayor de 68, con 26 aisladas). Dibujarlas todas juntas en una nube miente sobre la
estructura, así que hay tres zonas: **núcleo**, **grupos aparte** y **tablas sin
relaciones**.

Dentro del núcleo, las tablas más referenciadas reparten el círculo en sectores y el
resto orbita alrededor de aquella de la que está más cerca; el radio es la distancia real
en saltos de FK. El sector de cada hub es proporcional a cuántas tablas orbitan en él.

### 2. Los nodos no se escalan con el zoom

**Objeción bloqueante que mató la primera versión del diseño:** con etiquetas en unidades
de mundo hay una franja completa de zoom donde el texto mide entre 3 y 8 px. No existe
ningún zoom en el que el mapa sea legible y muestre más de un puñado de nodos.

El zoom mueve las posiciones; el chip mide siempre lo mismo en pantalla. Qué nodo muestra
su nombre y cuál se reduce a un punto lo decide una prueba de **colisión en espacio de
pantalla** por orden de importancia, no un umbral de zoom. Si la posición natural choca,
la etiqueta se desplaza en vertical —como en un mapa— antes de renunciar a ella. La tabla
seleccionada y las de la ruta conservan el nombre pase lo que pase.

Resultado medido en 1600×1000 con ambos paneles abiertos: 39–95 nombres legibles según el
encuadre. El original, a su zoom de ajuste, muestra cero.

### 3. El encuadre inicial es el núcleo, no el mundo

**Objeción bloqueante:** los cálculos de encuadre se hacían contra la ventana, no contra
el lienzo real (ventana menos riel menos panel). Con ambos paneles el lienzo es bastante
más estrecho y "ver todo" deja el zoom por debajo de lo utilizable, porque la rejilla de
tablas sueltas estira el lienzo a lo alto.

El encuadre inicial es la caja del núcleo. El suelo del zoom es **relativo al encuadre**
(0,85 × fit), no una constante: con una constante, en pantallas chicas parte del mapa
queda permanentemente fuera y ninguna tecla lo arregla.

En pantallas de menos de 1400 px el panel de detalle se superpone en vez de robarle ancho
al lienzo. Verificado en 1366×768.

### 4. El color de categoría no es el canal principal

262 de las 327 tablas de SAFF son `operacional`. Si el color de categoría fuera el
codificador principal, el 80% del mapa sería el mismo gris — exactamente el defecto que
se quería corregir. La categoría vive en un raíl estrecho del chip; lo que separa
visualmente es la jerarquía (hub / chip / punto), el estado (seleccionado, vecino, ruta,
resultado) y el atenuado del resto.

### 5. El teclado no secuestra Tab

**Objeción bloqueante:** con 327 nodos como paradas de tabulación, el usuario de teclado
queda ahogado dentro del lienzo. Los chips son `tabindex="-1"` y el lienzo es **una sola
parada de Tab**; dentro, las flechas mueven el foco al vecino más cercano en esa
dirección y Tab sale. `/` enfoca el buscador, `Esc` limpia, `f` encuadra el núcleo,
`F` ve todo, `r` alterna todas las relaciones.

### 6. La búsqueda indexa tokens, no subcadenas

**Objeción bloqueante:** buscar `id` por subcadena devuelve `COMU_ID`, `SOLI_ID`,
`PRED_ID`… es decir, casi todo el esquema. Un filtro que enciende todo no filtra nada.
Los nombres de columna se parten por `_` y se indexan por token.

Además, el caso más frecuente en estos esquemas denormalizados: **el concepto existe pero
no como tabla**. No hay ninguna tabla `REGION` ni en SAFF ni en SIDCO; la región está
repartida en decenas de columnas. La búsqueda lo dice explícitamente en vez de devolver
"sin resultados": *«No existe ninguna tabla llamada «rut»: aparece como columna en 19
tablas»*.

### 7. La ruta admite no existir

**Objeción bloqueante:** el 42% de los pares de tablas de SAFF y el 48% de los de SIDCO
**no tienen ruta** — hay 74 y 27 componentes desconectadas. Una herramienta de ruta que
no contemple eso miente casi la mitad de las veces. Cuando no hay camino se dice, y se
explica por qué. Cuando lo hay, la vista se encuadra sobre él.

### 8. El impacto real es el cierre transitivo

Preguntar "¿qué se rompe si toco esta tabla?" y responder con las dependientes directas
se queda corto. `comuna` en SIDCO tiene **7 dependientes directas** pero **54 tablas y
24.378.973 filas** en el cierre transitivo. `PREDIO` tiene 27 directas y 65 transitivas.
El panel muestra los dos números, y la semántica de `ON DELETE` cuando el diccionario la
trae (en SIDCO las 7 son `RESTRICT`: el borrado no rompe nada, queda bloqueado).

### 9. Las tablas "sin relaciones" sí tienen pistas

`log`, la tabla más grande de SIDCO (1.564.656.384 filas, el 89% de los registros del
sistema), aparecía como tabla aislada porque **el modelo no declara sus claves foráneas**.
Se aprende el destino canónico de cada nombre de columna a partir de las FK que sí están
declaradas y se marcan las columnas que siguen esa convención sin declararla: 159 en SAFF
y 45 en SIDCO, que dan pistas sobre 40 de las 71 tablas aisladas de SAFF y 19 de las 26
de SIDCO.

Estas relaciones **no se dibujan en el mapa ni se suman a los contadores**: aparecen en la
ficha, en su propia sección, etiquetadas como probables y con la advertencia de
verificarlas. Inventar aristas en el mapa sería peor que no tenerlas.

### 10. El orden nunca usa `localeCompare`

`localeCompare` depende de los datos de locale del navegador: sobre SAFF difiere del orden
por punto de código en 90 de 327 nombres. Como el orden decide qué nodo ocupa cada hueco,
el mapa saldría distinto según el equipo. Todas las ordenaciones del layout usan un
comparador por punto de código. El layout es determinista: dos ejecuciones dan posiciones
idénticas, verificado.

### 11. El pintado no pasa por React

El paneo, el zoom y la posición de cada chip se escriben imperativamente dentro de un
`requestAnimationFrame`. React solo se entera de los cambios de estado reales (selección,
filtros, ruta). Con 327 nodos, re-renderizar en cada muesca de rueda sería inusable.

## Limitaciones conocidas

- **La inferencia por nombre puede equivocarse.** Se exige mayoría clara (≥60%) del
  destino canónico y se marca como probable, pero no está verificada contra la base.
- **La relajación anti-solape mueve nodos.** Tras colocar los anillos, una pasada
  determinista separa cualquier par que se solape; eso desplaza algunos nodos unos píxeles
  fuera de su anillo exacto. Se prefirió eso a tener etiquetas encimadas.
- **No hay ruta ponderada.** El camino más corto trata todas las FK igual, así que puede
  pasar por una tabla de catálogo muy referenciada aunque semánticamente no sea la
  conexión "natural".
- **La vista Legacy no cambia de tema.** Es una reproducción del original, que solo
  existía en oscuro; ofrecer un toggle ahí prometería algo que no debe cambiar.
