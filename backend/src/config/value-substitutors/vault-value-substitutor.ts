import { VaultService } from "../../vault/vault-service";
import { ValueSubstitutor } from "../value-substitutor";

export class VaultValueSubstitutor implements ValueSubstitutor {
    constructor(private vault: VaultService) { }

    readonly name: string = "vault";
    value(value: string): Promise<string> {
        return this.vault.getSecret(value)
    }
}