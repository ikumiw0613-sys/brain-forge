export function ConveyorBelt() {
  return (
    <g strokeLinejoin="round">
      <path d="M56 255h878v47H56z" fill="#0d1317" opacity=".75" />
      <path d="M62 281h18v34H62zm212 0h18v34h-18zm219 0h18v34h-18zm220 0h18v34h-18zm202 0h18v34h-18z" fill="#303d44" stroke="#52616a" />
      <path d="M57 315h28m184 0h28m191 0h28m192 0h28m174 0h28" stroke="#6a787d" strokeWidth="3" />
      <path d="M49 252l24-20h872l-24 20z" fill="#26323a" stroke="#7e8e94" />
      <path d="M57 249l18-14h861l-18 14z" fill="#121a1f" />
      <rect x="43" y="251" width="889" height="38" rx="17" fill="#303c45" stroke="#75838b" />
      <rect x="49" y="257" width="877" height="26" rx="12" fill="#10181e" stroke="#55666e" />
      {Array.from({ length: 32 }, (_, index) => (
        <g key={index} transform={`translate(${65 + index * 27.25} 270)`}>
          <circle r="9" fill="#35434c" stroke="#60727a" />
          <circle r="3" fill="#83939b" />
        </g>
      ))}
      <path d="M59 251H916M59 288H916" stroke="#99a7ab" />
    </g>
  )
}

export function Sorter({ hazardPattern }: { hazardPattern: string }) {
  return (
    <g transform="translate(47 135)" strokeLinejoin="round">
      <path d="M0 145H108l14-14H14Z" fill="#303d44" stroke="#72828a" />
      <path d="M0 145h108v13H0z" fill="#202a31" stroke="#58686f" />
      <path d="M9 34L34 3h61l17 18v89l-18 14H9Z" fill="#38474e" stroke="#819198" />
      <path d="M34 3h61l17 18H51Z" fill="#6d7775" stroke="#9da49a" />
      <path d="M9 34l25-31 17 18-24 26z" fill="#b9803d" stroke="#e4b36f" />
      <path d="M27 47l24-26h61v89l-18 14H27Z" fill="#75512e" stroke="#d19c5c" />
      <path d="M9 34l18 13v98H9z" fill="#2a363d" stroke="#6a7b82" />
      <path d="M38 54l17-21h46v47H38Z" fill="#bd8744" stroke="#e9b974" />
      <path d="M55 43h38v27H48V53z" fill="#182228" stroke="#4b3e32" />
      <path d="M57 52h27m-27 8h18" stroke="#dda967" strokeWidth="2" />
      <circle cx="93" cy="61" r="2" fill="#f5c879" />
      <path d="M36 91h58v30H36z" fill="#10171c" stroke="#b4814b" />
      <path d="M41 96h49v8H41z" fill={`url(#${hazardPattern})`} />
      <path d="M34 121h64l16-18v19l-16 17H34z" fill="#49585e" stroke="#899b9e" />
      <path d="M38 137h55m-79-75h8m-8 9h8m-8 9h8" stroke="#92a2a4" />
    </g>
  )
}

export function Scanner() {
  return (
    <g transform="translate(467 126)" strokeLinejoin="round">
      <path d="M0 129h23l9-7H8zm84 0h23l9-7H92z" fill="#3c5059" stroke="#74939c" />
      <path d="M6 39l19-12v99l-19 4zm84 0l19-12v99l-19 4z" fill="#263c46" stroke="#698b98" />
      <path d="M6 39h13v88H6zm84 0h13v88H90z" fill="#38555f" stroke="#82a4ae" />
      <path d="M0 20L19 1h95v38H0Z" fill="#3b5965" stroke="#87aab6" />
      <path d="M0 20L19 1h95L97 20Z" fill="#557781" stroke="#91b1ba" />
      <path d="M97 20l17-19v38l-17 11z" fill="#203740" stroke="#6b939d" />
      <path d="M0 20h97v30H0z" fill="#334b55" stroke="#88aab1" />
      <path d="M12 29h73v12H12z" fill="#11232b" stroke="#6cb6c3" />
      <path d="M20 35h20m5 0h30" stroke="#85d4df" strokeWidth="2" />
      <path d="M12 60v53m85-53v53" stroke="#77adb9" strokeWidth="2" />
      <path d="M34 50h30v7H34z" fill="#19282e" stroke="#71929c" />
      <circle cx="49" cy="54" r="1.5" fill="#85d4df" />
    </g>
  )
}

export function ShippingGate({ hazardPattern }: { hazardPattern: string }) {
  return (
    <g transform="translate(852 137)" strokeLinejoin="round">
      <path d="M2 135h94l12-13H13Z" fill="#28363e" stroke="#74858e" />
      <path d="M5 33L22 8h70l19 17v91l-17 18H5Z" fill="#2d3b44" stroke="#788a94" />
      <path d="M5 33L22 8h70L78 33Z" fill="#52615f" stroke="#8a9794" />
      <path d="M78 33L92 8l19 17v91l-17 18V45Z" fill="#38464b" stroke="#7b8787" />
      <path d="M5 33h73l16 12v89H5Z" fill="#414b49" stroke="#9aa39c" />
      <path d="M17 55h58v69H17z" fill="#182027" stroke="#9b9b8c" />
      <path d="M18 59h56m-56 10h56m-56 10h56m-56 10h56m-56 10h56m-56 10h56m-56 10h56" stroke="#495960" />
      <path d="M14 39h57l8 7v5H14z" fill={`url(#${hazardPattern})`} />
      <path d="M30 18h34l-3 5H27Z" fill="#c98e46" />
      <path d="M83 61v59M99 64v48" stroke="#879390" />
    </g>
  )
}
