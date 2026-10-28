import { Input, Textarea } from '../ui';
import type { Address } from '../../types';

export default function AddressBox({ title, value, onChange }: { title: string; value: Address; onChange: (address: Address) => void }) {
    const set = (key: keyof Address) => (e: { target: { value: string } }) => onChange({ ...value, [key]: e.target.value });

    return (
        <div>
            <p className="mb-1 text-[13.5px] font-medium text-gray-700">{title}</p>
            <div className="space-y-1.5">
                <Textarea rows={2} placeholder="Street" value={value.street ?? ''} onChange={set('street')} />
                <div className="grid grid-cols-2 gap-1.5">
                    <Input placeholder="City" value={value.city ?? ''} onChange={set('city')} />
                    <Input placeholder="State" value={value.state ?? ''} onChange={set('state')} />
                    <Input placeholder="Zip" value={value.zip ?? ''} onChange={set('zip')} />
                    <Input placeholder="Country" value={value.country ?? ''} onChange={set('country')} />
                </div>
            </div>
        </div>
    );
}
