import type { Regulation } from './types';

// Conteudo da aba "Paciente" — so mobile (pedido do usuario, 2026-08-24:
// desktop/tablet ficam com 2 abas, mobile com 3). Dado vem de Regulation
// (f_Regulação_chamados), aninhado dentro de Mission — ver routes.ts.

function formatBool(value: boolean | null): string {
  if (value == null) return '—';
  return value ? 'Sim' : 'Não';
}

function formatWeight(kg: number | null): string {
  if (kg == null) return '—';
  return `${kg} kg`;
}

interface Field {
  label: string;
  value: string;
}

function buildFields(r: Regulation): Field[] {
  return [
    { label: 'Paciente', value: r.patientName ?? '—' },
    { label: 'Idade', value: r.patientAge ?? '—' },
    { label: 'Sexo', value: r.patientSex ?? '—' },
    { label: 'Data de nascimento', value: r.birthDate ?? '—' },
    { label: 'Peso', value: formatWeight(r.weightKg) },
    { label: 'Altura', value: r.heightCm ? `${r.heightCm} cm` : '—' },
    { label: 'Hipótese diagnóstica', value: r.diagnosis ?? '—' },
    { label: 'Motivo do chamado', value: r.callReason ?? '—' },
    {
      label: 'Tipo de paciente',
      value: r.patientType === 'Outros' && r.patientTypeOther ? r.patientTypeOther : r.patientType ?? '—',
    },
    { label: 'Intubado', value: formatBool(r.isIntubated) },
    { label: 'Obeso', value: formatBool(r.isObese) },
    { label: 'Triagem realizada', value: formatBool(r.triageCompleted) },
    { label: 'Plano', value: r.healthPlan ?? '—' },
    { label: 'Procedimento', value: r.procedure ?? '—' },
    { label: 'Equipamento', value: r.equipment ?? '—' },
    { label: 'Uso de dispositivo', value: r.deviceUsage ?? '—' },
    { label: 'Acompanhante', value: r.companion ?? '—' },
    { label: 'Médico na origem', value: r.originDoctor ?? '—' },
    { label: 'Médico no destino', value: r.destinationDoctor ?? '—' },
    { label: 'Observação', value: r.notes ?? '—' },
  ];
}

export default function PatientFields({ regulation }: { regulation: Regulation | null }) {
  if (!regulation) {
    return (
      <div className="text-body-sm-regular font-body" style={{ color: 'var(--color-gray-400)', padding: '8px 0' }}>
        Dados do paciente ainda não disponíveis para esta missão.
      </div>
    );
  }

  return (
    <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {buildFields(regulation).map((field) => (
        <div key={field.label}>
          <dt
            className="text-body-sm-semibold font-body"
            style={{ textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--color-gray-400)' }}
          >
            {field.label}
          </dt>
          <dd className="text-body-sm-regular font-body" style={{ margin: '2px 0 0' }}>
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
