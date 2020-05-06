import { AzureFunction, Context } from "@azure/functions"
import { PrivateDnsManagementClient, PrivateDnsManagementModels } from "@azure/arm-privatedns";
import * as MSRest from "@azure/ms-rest-js";
import * as MSRestNodeAuth from "@azure/ms-rest-nodeauth";
import * as Util from "util";
import * as Atob from "atob";

enum EnvVars {
    authenticationType = "PRIVATE_AKS_DNS_ZONE_LINKER_AUTHENTICATION_TYPE",
    msiEndpoint = "MSI_ENDPOINT",
    servicePrincipalTenantId = "PRIVATE_AKS_DNS_ZONE_LINKER_SP_TENANT_ID",
    servicePrincipalClientId = "PRIVATE_AKS_DNS_ZONE_LINKER_SP_CLIENT_ID",
    servicePrincipalSecret = "PRIVATE_AKS_DNS_ZONE_LINKER_SP_SECRET",
    targetVNets = "PRIVATE_AKS_DNS_ZONE_LINKER_TARGET_VNETS"
}

enum AuthenticationType {
    servicePrincipalSecret = "SERVICE_PRINCIPAL_SECRET",
    appServiceMSI = "APP_SERVICE_MSI"
}

interface ResourceIdProps {
    id: string
    subscriptionId: string
    resourceGroupName: string
    name: string
}

const run: AzureFunction = async function (context: Context, event: Object): Promise<void> {
    context.log(`Event grid trigger function processed an event: ${Util.inspect(event, {showHidden: false, depth: null})}`);
    const eventIdentifier = "Microsoft.Resources.ResourceWriteSuccess";
    const operationNameIdentifier = "Microsoft.Network/privateDnsZones/write";
    const aksIdentifier = "azmk8s.io"
    const resourceId: string = event["subject"];
    const shouldCreateLink = event["eventType"] === eventIdentifier && event["data"]["operationName"] === operationNameIdentifier && resourceId.endsWith(aksIdentifier);
    if (!shouldCreateLink) {
        context.log(`Bailing. Link shouldn't be created for resourceId: ${resourceId}`)
        return;
    }
    context.log("Proceeding to process event..");
    const credentials = await authenticate(context);
    const zoneResourceIdProps = decodePrivateDNSZoneResourceId(resourceId);
    const privateDNSClient = new PrivateDnsManagementClient(credentials, zoneResourceIdProps.subscriptionId);
    const targetVNetResourceIdsProps = targetVNetsFromEnvironment();
    const zoneName = zoneResourceIdProps.name;
    for (const targetVNetResourceIdProps of targetVNetResourceIdsProps) {
        const resourceGroupName = zoneResourceIdProps.resourceGroupName;
        const linkName = targetVNetResourceIdProps.name;
        const parameters: PrivateDnsManagementModels.VirtualNetworkLink = {
            virtualNetwork: {
                id: targetVNetResourceIdProps.id
            },
            location: "global",
            registrationEnabled: false
        }
        const VirtualNetworkLink = await privateDNSClient.virtualNetworkLinks.beginCreateOrUpdate(resourceGroupName, zoneName, linkName, parameters);
        context.log(`Created virtual network link: ${Util.inspect(VirtualNetworkLink, {showHidden: false, depth: null})}`);
    }
};

async function authenticate(context: Context): Promise<MSRest.ServiceClientCredentials> {
    const authenticationType = process.env[EnvVars.authenticationType];
    switch (authenticationType) {
        case AuthenticationType.servicePrincipalSecret: {
            const tenantId = process.env[EnvVars.servicePrincipalTenantId];
            const clientId = process.env[EnvVars.servicePrincipalClientId];
            const secret = process.env[EnvVars.servicePrincipalSecret];
            const credentials = await MSRestNodeAuth.loginWithServicePrincipalSecret(clientId, secret, tenantId);
            const castedCredentials = credentials as unknown as MSRest.ServiceClientCredentials;
            return castedCredentials;
        }
        case AuthenticationType.appServiceMSI: {
            const credentials = await MSRestNodeAuth.loginWithAppServiceMSI()
            const castedCredentials = credentials as unknown as MSRest.ServiceClientCredentials;
            return castedCredentials;
        }
        default: {
            throw `Unknown authentication type provided in env var ${EnvVars.authenticationType}: ${authenticationType}`
        }
    }
}

function targetVNetsFromEnvironment(): ResourceIdProps[] {
    const envVar = process.env[EnvVars.targetVNets];
    if (envVar == null) {
        throw `No target vnets defined. They have to be set in env var ${EnvVars.targetVNets} as a base64 encoded JSON array of resource id strings.`;
    }
    const decodedEnvVar = Atob(envVar);
    const targetVNetResourceIds: string[] = JSON.parse(decodedEnvVar);
    const targetVNetResourceIdProps: ResourceIdProps[] = targetVNetResourceIds.map(decodeVNetResourceId);
    return targetVNetResourceIdProps;
}

function decodePrivateDNSZoneResourceId(resourceId: string): ResourceIdProps {
    return decodeCommonResourceId(resourceId);
}

function decodeVNetResourceId(resourceId: string): ResourceIdProps {
    return decodeCommonResourceId(resourceId);
}

function decodeCommonResourceId(resourceId: string): ResourceIdProps {
    const decodeRegEx = new RegExp("\/.*\/([^/]*)\/.*\/([^/]*)\/.*\/.*\/.*\/([^/]*)");
    const decodeResult = decodeRegEx.exec(resourceId);
    let decodedResourceId: ResourceIdProps = {
        id: resourceId,
        subscriptionId: decodeResult[1],
        resourceGroupName: decodeResult[2],
        name: decodeResult[3]
    };
    return decodedResourceId;
}

export = run;
