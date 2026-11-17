# rag.mytoslab.com – AWS CDK

Infraestructura creada:

- VPC en dos AZs, con subredes públicas para el ALB y subred privada/pública para EC2.
- EC2 pública `m7g.xlarge` ARM64 con volumen raíz EBS gp3 cifrado de 36 GiB y key pair `onyx_ec2`.
- ALB público únicamente por HTTPS/443.
- Certificado ACM para `rag.mytoslab.com`, validado por DNS en la hosted zone existente.
- Target group HTTP/80 hacia la EC2.
- Alias Route 53 `rag.mytoslab.com` apuntando al ALB.

Los certificados públicos creados con `acm.Certificate` son no exportables por defecto; no se configura ninguna opción de exportación.

## Despliegue

Requisitos: Node.js, AWS CDK v2 y credenciales AWS con permisos para VPC, EC2, ELB, ACM y Route 53.

```bash
npm install
aws sts get-caller-identity
cdk bootstrap aws:///eu-west-1
npm run synth
npm run deploy --profile cdk-personal
```

La instancia está en una subred pública y el puerto SSH/22 está abierto a Internet (`0.0.0.0/0` y `::/0`). El key pair `onyx_ec2` debe existir previamente en `eu-west-1` y ser compatible con la AMI ARM64. Por seguridad, es preferible sustituir estas reglas por la IP pública fija de administración o usar SSM/VPN.

Para ejecutar onyx, conectar al SSH de la EC2 y ejecutar: 
curl -fsSL https://onyx.app/install_onyx.sh | bash

fallará el nginx en la configuracion del MCP, ir al deployment:
cd 
editar .env y desabilitar el MCP
de nuevo onyx-cli deploy install, y seleccionas restart
