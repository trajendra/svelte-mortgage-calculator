<script>
	var formatter = new Intl.NumberFormat("en-US", {
		style: "currency",
		currency: "USD"
	});

	let years =15;
	let loanamount = 500000;
	let interestrateinput = 200;
	$: interestrate = interestrateinput / 100;
	$: totalpayments = years * 12;
	$: monthlyinterestrate = interestrate / 100 /12;
	$: monthlypayment = (loanamount *
      Math.pow(1 + monthlyinterestrate, totalpayments) *
      monthlyinterestrate) /
    (Math.pow(1 + monthlyinterestrate, totalpayments) - 1);

	$: totalpaid = monthlypayment * totalpayments;
   	$: interestpaid = totalpaid - loanamount;

</script>
<style>
	.outputs {
		font-size: 20px;
		border: solid black 2px;
		margin-top: 15px;
		text-align: center;
	}
</style>
<main class="container">
	<div class="row">
		<h1> Mortgage Calculator </h1>
	</div>
	<div class="row">
		<label> Loan Amount </label>
		<input
		 min="1"
		 placeholder={loanamount}
		 type="number"
		 class="u-full-width" 
		 bind:value={loanamount}/>
	</div>
	
	<div class="row">
		<div class="columns six">
			<label> years </label>
			<input type="range" min="1" max="50" 
			class="u-full-width" 
			bind:value={years} />
		</div>
		<div class ="columns six outputs"> {years} years </div>
	</div>

	<div class="row">
		<div class="columns six">
			<label> Interest Rate </label>
			<input type="range" min="1" max="2000" 
			class="u-full-width" 
			bind:value={interestrateinput} />
		</div>
		<div class ="columns six outputs"> {interestrate.toFixed(2)} %</div>
	</div>

	<div class="row outputs"> Monthly Payments {formatter.format(monthlypayment)} </div>
	<div class="row outputs"> Total Paid {formatter.format(totalpaid)} </div>
	<div class="row outputs"> Interest Paid {formatter.format(interestpaid)} </div>




</main>