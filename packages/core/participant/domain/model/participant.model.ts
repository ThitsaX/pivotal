import {Column, Entity, Index, PrimaryGeneratedColumn} from 'typeorm';

@Entity({name: 'participant'})
@Index('participant_01_uk', ['name'], {unique: true})
export class Participant {

    @PrimaryGeneratedColumn({type: 'bigint', name: 'id'})
    public id: string;

    @Column({type: 'varchar', length: 128, name: 'name'})
    public name: string;

    @Column({type: 'text', name: 'jws_public_key'})
    public jwsPublicKey: string;

    @Column({type: 'text', name: 'jws_private_key'})
    public jwsPrivateKey: string;

    @Column({type: 'text', name: 'access_public_key'})
    public accessPublicKey: string;

    constructor(
        name: string,
        jwsPublicKey: string,
        jwsPrivateKey: string,
        accessPublicKey: string,
        id?: string,
    ) {

        if (id !== undefined) {
            this.id = id;
        }

        this.name = name;
        this.jwsPublicKey = jwsPublicKey;
        this.jwsPrivateKey = jwsPrivateKey;
        this.accessPublicKey = accessPublicKey;
    }
}
