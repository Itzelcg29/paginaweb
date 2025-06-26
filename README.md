# Sistema ERP - Escuela de Inglés

Sistema de administración completo para escuela de inglés con gestión de usuarios, cursos, pagos y reportes.

## 🚀 Características Principales

### 👥 Gestión de Usuarios
- Registro e inicio de sesión con roles (Alumno, Maestro, Administrador)
- Control de acceso RBAC (Role-Based Access Control)
- Gestión de perfiles con documentos y fotos

### 📚 Gestión Académica
- Creación y administración de cursos por niveles
- Sistema de calificaciones y asistencia
- Material de estudio por curso
- Comentarios y feedback de maestros

### 💰 Sistema de Pagos
- Integración con Stripe/Conekta
- Pagos por curso o mensualidades
- Registro de pagos manuales
- Generación de facturas

### 📊 Reportes y Estadísticas
- Reportes de asistencia y desempeño
- Estadísticas de ingresos
- Historial académico completo

## 🛠 Stack Tecnológico

- **Frontend**: React + Tailwind CSS
- **Backend**: Node.js + Express
- **Base de Datos**: PostgreSQL
- **Autenticación**: JWT
- **Pagos**: Stripe/Conekta
- **Deploy**: Railway

## 📦 Instalación

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd AdministracionInglesG
```

2. **Instalar dependencias**
```bash
npm run install-all
```

3. **Configurar variables de entorno**
```bash
# Copiar archivos de ejemplo
cp server/.env.example server/.env
cp client/.env.example client/.env
```

4. **Configurar base de datos**
```bash
npm run setup-db
```

5. **Ejecutar en desarrollo**
```bash
npm run dev
```

## 🔧 Configuración

### Variables de Entorno - Backend (.env)
```
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5432/ingles_erp
JWT_SECRET=your_jwt_secret
STRIPE_SECRET_KEY=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret
```

### Variables de Entorno - Frontend (.env)
```
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_STRIPE_PUBLIC_KEY=your_stripe_public_key
```

## 📁 Estructura del Proyecto

```
AdministracionInglesG/
├── server/                 # Backend Node.js/Express
│   ├── controllers/        # Controladores de la API
│   ├── models/            # Modelos de base de datos
│   ├── routes/            # Rutas de la API
│   ├── middleware/        # Middleware personalizado
│   ├── utils/             # Utilidades y helpers
│   └── config/            # Configuración de BD
├── client/                # Frontend React
│   ├── src/
│   │   ├── components/    # Componentes reutilizables
│   │   ├── pages/         # Páginas principales
│   │   ├── hooks/         # Custom hooks
│   │   ├── context/       # Context API
│   │   └── utils/         # Utilidades del frontend
│   └── public/
└── docs/                  # Documentación adicional
```

## 👥 Roles y Permisos

### Administrador
- Gestión completa de usuarios
- Administración de cursos y niveles
- Gestión de pagos y facturación
- Acceso a todos los reportes

### Maestro
- Ver cursos asignados
- Subir calificaciones y asistencia
- Agregar comentarios y recursos
- Ver alumnos de sus cursos

### Alumno
- Ver cursos inscritos
- Acceder a materiales
- Ver calificaciones y progreso
- Realizar pagos

## 🚀 Deploy

### Railway
1. Conectar repositorio a Railway
2. Configurar variables de entorno
3. Deploy automático

### Local
```bash
npm run build
npm start
```

## 📞 Soporte

Para soporte técnico o preguntas, contactar al equipo de desarrollo.

## 📄 Licencia

MIT License - ver archivo LICENSE para más detalles. 