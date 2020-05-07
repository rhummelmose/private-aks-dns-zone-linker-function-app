# private-aks-dns-zone-linker-function-app

This function was built to allow enterprises with hub/spoke networking topologies in Azure, using their own DNS to enable name resolution to/from on-premises to use private link enabled AKS clusters as per the documentation (https://docs.microsoft.com/en-us/azure/aks/private-clusters#hub-and-spoke-with-custom-dns).

## Does this apply to you checklist

- Do you have a hub/spoke networking topology in Azure?
- Do you provision your own DNS server in hub networks to allow connectivity to/from on-premises?
- Do you need private link enabled clusters provisioned without manual intervention?

If you can answer *yes* to the above, and BYO DNS still isn't available for AKS private clusters, then it does.

## What does the function do

1. It triggers when new resources are created, reacting only to private DNS zones created by AKS
1. Gets a list of target VNets from the environment, for which a link from the private DNS zone should be created
1. Creates said links

## Instructions

1. Create a new function app with runtime stack *node* version *12*
1. Enable system managed identity on the function app
1. Grant *Network Contributor* and *DNS Contributor* roles to the function app's identity
1. On the function app, add a new application configuration variable: *PRIVATE_AKS_DNS_ZONE_LINKER_AUTHENTICATION_TYPE* with value *APP_SERVICE_MSI*
1. base64 encode a JSON array of your hub vnet resource ids. Ie. *echo -n '["id1", "id2"]' | base64*
1. On the function app, add a new application configuration variable: *PRIVATE_AKS_DNS_ZONE_LINKER_TARGET_VNETS* with a value derived from the previous bullet.
1. Run command *tsc* to compile the function app - requires TypeScript (https://www.typescriptlang.org/#download-links)
1. Run command *func azure functionapp publish <your-app-name>* to publish the function - requires azure-functions-core-tools (https://github.com/Azure/azure-functions-core-tools)
1. Subscribe the function to all events on the subscriptions relevant

## IMPORTANT

Even though the function only reacts to events of type *ResourceWriteSuccess* on the private DNS zone resource type, I've found that when applying any filters at all a significant delay is sometimes introduced from action to event, causing the function not to run in time. Sometimes the delay has been hours.

I haven't been able to break it when subscribing to *ALL* events on a given subscription.
