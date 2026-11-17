import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53_targets from 'aws-cdk-lib/aws-route53-targets';
import * as targets from 'aws-cdk-lib/aws-elasticloadbalancingv2-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

export class RagMytoslabStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'MytoslabZone', {
      hostedZoneId: 'Z02677451QN32TIP1BSP0',
      zoneName: 'mytoslab.com'
    });

    const vpc = new ec2.Vpc(this, 'RagVpc', {
      maxAzs: 2,
      natGateways: 0,
      ipAddresses: ec2.IpAddresses.cidr('10.42.0.0/16'),
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24
        },
        {
          name: 'PrivateIsolated',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24
        }
      ]
    });

    const albSg = new ec2.SecurityGroup(this, 'AlbSecurityGroup', {
      vpc,
      description: 'Allow public HTTPS traffic to the ALB',
      allowAllOutbound: true
    });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'Public HTTPS');
    albSg.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(443), 'Public HTTPS IPv6');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP redirect to HTTPS');
    albSg.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(80), 'HTTP redirect to HTTPS IPv6');

    const instanceSg = new ec2.SecurityGroup(this, 'InstanceSecurityGroup', {
      vpc,
      description: 'Allow web traffic only from the ALB',
      allowAllOutbound: true
    });
    instanceSg.addIngressRule(albSg, ec2.Port.tcp(80), 'HTTP from ALB');
    instanceSg.addIngressRule(albSg, ec2.Port.tcp(443), 'HTTPS from ALB');
    instanceSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'Public SSH IPv4');
    instanceSg.addIngressRule(ec2.Peer.anyIpv6(), ec2.Port.tcp(22), 'Public SSH IPv6');

    const keyPair = ec2.KeyPair.fromKeyPairName(this, 'OnyxEc2KeyPair', 'onyx_ec2');

    const instance = new ec2.Instance(this, 'RagInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: new ec2.InstanceType('m7g.xlarge'),
      keyPair,
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64
      }),
      securityGroup: instanceSg,
      blockDevices: [
        {
          deviceName: '/dev/xvda',
          volume: ec2.BlockDeviceVolume.ebs(36, {
            volumeType: ec2.EbsDeviceVolumeType.GP3,
            encrypted: true,
            deleteOnTermination: true
          })
        }
      ],
      requireImdsv2: true
    });

    const certificate = new acm.Certificate(this, 'RagCertificate', {
      domainName: 'rag.mytoslab.com',
      validation: acm.CertificateValidation.fromDns(zone),
      transparencyLoggingEnabled: true
    });

    const alb = new elbv2.ApplicationLoadBalancer(this, 'RagAlb', {
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: albSg
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, 'RagTargetGroup', {
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 80,
      targetType: elbv2.TargetType.INSTANCE,
      targets: [new targets.InstanceTarget(instance, 80)],
      healthCheck: {
        protocol: elbv2.Protocol.HTTP,
        port: '80',
        path: '/',
        healthyHttpCodes: '200-399'
      }
    });

    alb.addListener('HttpsListener', {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
      defaultTargetGroups: [targetGroup]
    });

    alb.addListener('HttpRedirectListener', {
      port: 80,
      protocol: elbv2.ApplicationProtocol.HTTP,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: 'HTTPS',
        port: '443',
        permanent: true
      })
    });

    new route53.ARecord(this, 'RagAliasRecord', {
      zone,
      recordName: 'rag.mytoslab.com',
      target: route53.RecordTarget.fromAlias(new route53_targets.LoadBalancerTarget(alb))
    });

    new cdk.CfnOutput(this, 'AlbDnsName', { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, 'InstanceId', { value: instance.instanceId });
    new cdk.CfnOutput(this, 'ApplicationUrl', { value: 'https://rag.mytoslab.com' });
  }
}
