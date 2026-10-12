# Los Cuates Corte Láser · Control de pedidos

Página web para que la familia registre pedidos de corte y grabado, costos, anticipos, abonos, gastos y estado de producción.

## Qué incluye

- **4 datos principales:** total del pedido, materiales y costos, anticipo, y si pidió factura.
- Cliente y descripción opcionales, varios materiales por pedido y costo unitario diferente por termo.
- Cambio de estado: por iniciar, en producción, listo, entregado y cancelado.
- Abonos posteriores y saldo por cobrar.
- Panel de dinero cobrado, saldos, IVA incluido en lo cobrado y utilidad aproximada.
- Registro separado de compras de inventario, gastos operativos e inversión en equipo.
- Exportar pedidos a CSV y respaldo completo a JSON.
- Modo local para probar, o **Firebase** para sincronizar en tiempo real entre familiares.
- Protección de Firestore mediante usuarios de Firebase Authentication y lista de miembros autorizados.

## Probar primero (sin nube)

1. Descarga y descomprime todos los archivos en la misma carpeta.
2. Puedes abrir `index.html` en algunos navegadores, pero si aparecen errores por módulos JavaScript, usa VS Code + Live Server o inicia un servidor local desde esa carpeta con `python -m http.server 8000`.
3. Abre `http://localhost:8000` y registra pedidos de prueba. Verás `Modo local` en la esquina. **Los datos se quedan en ese navegador, NO se comparten con la familia.**

## Activar uso familiar con Firebase

**Se recomienda crear un proyecto de Firebase independiente** para Los Cuates, sin mezclarlo con el proyecto de juegos u otras aplicaciones.

1. En https://console.firebase.google.com, crea un proyecto llamado, por ejemplo, `los-cuates-corte-laser` (el identificador exacto puede variar).
2. En la configuración del proyecto, registra una **aplicación web**. Copia el objeto de configuración web al archivo `firebase-config.js`. No uses claves privadas ni archivos JSON de cuentas de servicio.
3. En **Authentication → Sign-in method**, habilita **Correo electrónico / contraseña**.
4. En **Authentication → Users**, crea cada usuario de la familia con su propio correo y contraseña. No compartan una sola cuenta.
5. En **Firestore Database**, crea la base de datos en modo **producción**, según la región elegida.
6. En **Firestore Database → Rules**, pega el contenido completo de `firestore.rules` y pulsa **Publish**. No uses reglas abiertas (`allow read, write: if true`).
7. Para cada persona, abre **Authentication → Users**, copia su **UID**. Luego en **Firestore → Data**, crea la colección `members` y un documento cuyo ID sea exactamente ese UID. Agrega un campo, por ejemplo, `name` de tipo string con su nombre. **No crees miembros desde la aplicación**.
8. En **Authentication → Settings → Authorized domains**, comprueba que esté autorizado el dominio desde el que usarás la app. Para GitHub Pages será `<usuario>.github.io` si Firebase lo requiere.
9. Publica la página como se indica a continuación. Cada familiar inicia sesión con su correo y contraseña y verá las mismas órdenes.

### Si aparece «Tu cuenta necesita autorización»

Significa que inició sesión correctamente pero falta el documento `members/{UID}` en Firestore. La página muestra el UID para copiarlo. El administrador debe crearlo desde la consola de Firebase. Después se actualiza la página.

### Seguridad y límites

- `firebase-config.js` contiene **configuración pública de la app web**, no una contraseña del administrador. Las **reglas de Firestore son la barrera real de acceso**.
- La página de GitHub Pages es públicamente accesible como página web; los datos en Firestore deben quedar restringidos por las reglas indicadas.
- No subas archivos de cuentas de servicio, contraseñas, claves privadas, ni historiales de clientes al repositorio de GitHub.
- Con las reglas proporcionadas, todos los miembros autorizados pueden leer y cambiar pedidos y gastos. Para agregar permisos diferenciados de administrador, se requerirían reglas adicionales.
- La versión es una herramienta administrativa sencilla. No emite CFDI, no calcula impuestos definitivos, no integra SAT y no lleva inventario automático de existencias.
- El campo “¿Pidió factura?” es únicamente una marca de solicitud. **El IVA de una venta gravada no desaparece por no haber solicitado factura**.
- Los costos por material se consideran con el importe que introduzcas. No se calcula IVA acreditable de las compras ni posibles retenciones.
- El IVA incluido se calcula como `Total × 16 / 116` para operaciones gravadas al 16%. Si manejas operaciones exentas o tasa 0%, necesitarás modificar el tratamiento fiscal de esas operaciones.
- Las utilidades consideran la venta sin IVA menos materiales, costos extras por pedido y gastos operativos generales; excluyen ISR, depreciación fiscal y gastos no capturados.
- Cuando compres MDF o termos, regístralos como **inventario**. Cuando los uses en un pedido, pon el costo unitario dentro del pedido. No vuelvas a registrar los mismos materiales como gasto operativo.
- Cambiar un pedido a cancelado lo excluye de ventas vigentes. La aplicación **no administra devoluciones ni notas de crédito**; revisa manualmente los pagos existentes antes de cancelar.
- Haz respaldos periódicos desde Ajustes. La aplicación exporta pero no importa automáticamente el JSON de respaldo.

## Publicar en GitHub Pages

1. Ingresa a https://github.com/new y crea un repositorio nuevo, por ejemplo `los-cuates-control`. En la modalidad gratuita, publica un repositorio **público solo con código**, sin pedidos ni datos privados.
2. Sube `index.html`, `app.js`, `firebase-config.js`, `firestore.rules`, `INSTRUCCIONES.md` y `.nojekyll` al nivel raíz. Nunca subas respaldos JSON, CSV ni datos de clientes.
3. Ve a **Settings → Pages → Build and deployment → Deploy from a branch**.
4. Selecciona `main` y `/ (root)` y pulsa **Save**.
5. Abre `https://TU_USUARIO.github.io/los-cuates-control/` (sustituye `TU_USUARIO` por tu usuario real). Si elegiste otro nombre para el repositorio, cambia la ruta final.
6. Agrega `<usuario>.github.io` a dominios autorizados de Firebase Authentication si no figura allí.
7. Comparte el enlace de la web con tus familiares y crea sus usuarios/autorizaciones en Firebase.

> Atención: habilitar GitHub Pages publica el sitio web, **no** debe publicar la base de datos. La base se consulta únicamente por las cuentas permitidas en Firestore.

## Cómo registrar movimientos anteriores

Registra las compras anteriores en **Compras y gastos**, eligiendo Inventario, Operación o Equipo. Registra los pedidos anteriores en **Nueva orden**. No se cargan importes previos automáticamente, para no publicar información financiera privada en el código fuente.

Si no sabes si un pedido anterior ya incluía IVA, confirma el tratamiento con tu contador antes de usar sus cifras como utilidad fiscal.

## Tecnologías

HTML, CSS y JavaScript sin compilación. Firebase JavaScript SDK 12.19.0 desde el CDN oficial, Authentication con correo/contraseña y Firestore en tiempo real. El modo local utiliza localStorage.


## Revisión inicial

Se conserva el diseño. Las ediciones detectan cambios realizados por otro familiar y piden reabrir el pedido. Los abonos verifican que el pedido no esté cancelado.

Pendiente: inventario de existencias, roles, panel de administrador, reportes por periodo e importación del historial. Firebase no está configurado todavía; la sincronización y las reglas requieren pruebas con cuentas reales.

La inversión inicial se capturará una sola vez como Equipo después de activar la base compartida. No se publica en el código.
